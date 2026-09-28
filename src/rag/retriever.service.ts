import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chunk, ChunkDocument } from '../documents/chunk.schema';
import { GeminiService } from './gemini.service';

const VECTOR_INDEX = 'autoembed_index';
const EMBED_DIMS = 768;
const MIN_SCORE = 0.4;
const TOP_K = 3;
const NUM_CANDIDATES = 50;
const MAX_CHUNK_CHARS = 1200;

export interface RetrievedChunk {
  id: string;
  heading: string;
  text: string;
  score: number;
}

@Injectable()
export class RetrieverService implements OnModuleInit {
  private readonly logger = new Logger(RetrieverService.name);

  constructor(
    @InjectModel(Chunk.name) private chunkModel: Model<ChunkDocument>,
    private gemini: GeminiService,
  ) {}

  onModuleInit() {
    // No se espera: el arranque no se frena y un error solo queda en el log.
    this.ensureVectorIndex().catch((err) =>
      this.logger.error(`Could not verify/create vector index "${VECTOR_INDEX}": ${err.message}`),
    );
  }

  // Sin este índice $vectorSearch no falla: devuelve 0 resultados y el chat
  // contesta "No encuentro esa información". Atlas lo borra si se elimina la
  // colección, así que se recrea solo cuando falta.
  private async ensureVectorIndex() {
    const collection = this.chunkModel.collection;
    const existing = await collection.listSearchIndexes(VECTOR_INDEX).toArray();
    if (existing.length > 0) return;
    this.logger.warn(`Vector index "${VECTOR_INDEX}" missing — creating it`);
    await collection.createSearchIndex({
      name: VECTOR_INDEX,
      type: 'vectorSearch',
      definition: {
        fields: [{ type: 'vector', path: 'embedding', numDimensions: EMBED_DIMS, similarity: 'cosine' }],
      },
    });
  }

  async search(question: string): Promise<RetrievedChunk[]> {
    // Solo cuentan los fragmentos de documentos terminados (los que tienen embedding).
    const totalChunks = await this.chunkModel.countDocuments({ embedding: { $exists: true } } as any);
    this.logger.log(`Total chunks in DB: ${totalChunks}`);

    if (totalChunks === 0) {
      this.logger.warn('No chunks found — material was never ingested.');
      return [];
    }

    const normalizedQuestion = normalizeQuery(question);
    if (normalizedQuestion !== question) {
      this.logger.log(`Query normalized: "${question}" → "${normalizedQuestion}"`);
    }

    // If the question targets a specific chapter, search by heading first
    const chapterNum = extractChapterNumber(normalizedQuestion);
    if (chapterNum !== null) {
      const headingChunks = await this.chunkModel
        .find({ heading: { $regex: `cap\\.?\\s*${chapterNum}(?!\\d)`, $options: 'i' }, embedding: { $exists: true } } as any)
        .select('_id heading text')
        .limit(TOP_K)
        .lean();

      if (headingChunks.length > 0) {
        this.logger.log(`Heading search for cap${chapterNum}: found ${headingChunks.length} chunks (headings: ${[...new Set(headingChunks.map((c: any) => c.heading))].join(', ')})`);
        return headingChunks.map((r: any) => ({
          id: r._id.toString(),
          heading: r.heading,
          text: truncate(r.text),
          score: 1.0,
        }));
      }
      this.logger.log(`Heading search for cap${chapterNum}: no match, falling back to vector search`);
    }

    const queryVector = await this.gemini.embedText(normalizedQuestion);
    this.logger.log(`Query vector dims: ${queryVector.length}`);

    const results = await (this.chunkModel as any).aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: 'embedding',
          queryVector,
          numCandidates: NUM_CANDIDATES,
          limit: TOP_K,
        },
      },
      {
        $project: {
          _id: 1,
          heading: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    this.logger.log(`Vector search returned ${results.length} results. Scores: ${results.map((r: any) => r.score?.toFixed(3)).join(', ')}`);

    const filtered = results.filter((r: any) => r.score >= MIN_SCORE);
    this.logger.log(`After MIN_SCORE (${MIN_SCORE}) filter: ${filtered.length} chunks`);

    return filtered.map((r: any) => ({
      id: r._id.toString(),
      heading: r.heading,
      text: truncate(r.text),
      score: r.score,
    }));
  }
}

// "capítulo 6" / "cap. 6" / "capitulo6" → "cap6" to match PDF-derived headings like "Cap6-Altimetria"
function normalizeQuery(q: string): string {
  return q
    .replace(/cap[ií]tulo[s]?\s*\.?\s*(\d+)/gi, 'cap$1')
    .replace(/cap\.\s*(\d+)/gi, 'cap$1')
    .replace(/\bch\.?\s*(\d+)\b/gi, 'cap$1');
}

// Returns chapter number if the query explicitly references one, null otherwise
function extractChapterNumber(q: string): number | null {
  const m = q.match(/\bcap\s*(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function truncate(text: string): string {
  return text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '…' : text;
}
