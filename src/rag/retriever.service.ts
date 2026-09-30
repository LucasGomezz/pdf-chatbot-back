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

    const queryVector = await this.gemini.embedText(normalizedQuestion);

    // If the question targets a specific chapter, search by heading first
    const chapterNum = extractChapterNumber(normalizedQuestion);
    if (chapterNum !== null) {
      const headingChunks = await this.chunkModel
        .find({ heading: { $regex: `cap\\.?\\s*${chapterNum}(?!\\d)`, $options: 'i' }, embedding: { $exists: true } } as any)
        .select('_id documentId heading text embedding')
        .lean();

      if (headingChunks.length > 0) {
        const selected = pickChapterChunks(headingChunks, normalizedQuestion, queryVector);
        this.logger.log(`Heading search for cap${chapterNum}: ${headingChunks.length} chunks matched, using ${selected.length} (headings: ${[...new Set(selected.map((c) => c.heading))].join(', ')})`);
        return selected;
      }
      this.logger.log(`Heading search for cap${chapterNum}: no match, falling back to vector search`);
    }
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

// Palabras que no sirven para distinguir un material de otro ("cap", "capitulo", números).
const TITLE_STOPWORDS = new Set(['cap', 'capitulo', 'capitulos', 'del', 'las', 'los', 'por', 'para', 'con']);

// Varios materiales pueden tener el mismo número de capítulo (p. ej. "Cap1-Errores"
// y "LIBRO Jardi Cap. 1"). Si la pregunta nombra alguno ("libro", "jardi",
// "errores"), se usa solo ese. Si no, se mandan fragmentos de cada uno para que la
// respuesta distinga los materiales en vez de elegir uno a ciegas.
function pickChapterChunks(chunks: any[], question: string, queryVector: number[]): RetrievedChunk[] {
  const byDoc = new Map<string, any[]>();
  for (const c of chunks) {
    const key = String(c.documentId);
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key)!.push(c);
  }

  let docs = [...byDoc.values()];
  if (docs.length > 1) {
    const questionWords = new Set(words(question));
    const named = docs.filter((d) => words(d[0].heading).some((w) => questionWords.has(w)));
    if (named.length > 0) docs = named;
  }

  const perDoc = docs.length > 1 ? 2 : TOP_K;
  return docs
    .flatMap((d) =>
      d
        .map((c) => ({ c, score: cosine(queryVector, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, perDoc),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K * 2)
    .map(({ c, score }) => ({ id: c._id.toString(), heading: c.heading, text: truncate(c.text), score }));
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w))
    // Sin la "s" final, "apuntes" en la pregunta coincide con "Apunte" en el título.
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function truncate(text: string): string {
  return text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '…' : text;
}
