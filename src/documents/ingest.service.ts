import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
// Debe importarse antes que 'pdf-parse': provee un CanvasFactory que evita que
// la librería falle con "DOMMatrix is not defined" en entornos serverless
// (Vercel/AWS Lambda) donde el paquete opcional @napi-rs/canvas no está disponible.
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import { MaterialDocument, DocumentDoc } from './document.schema';
import { Chunk, ChunkDocument } from './chunk.schema';
import { EmbedRateLimitError, GeminiService } from '../rag/gemini.service';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const EMBED_BATCH_SIZE = 20;
// Tiempo máximo que una llamada a processNext sigue arrancando tandas nuevas.
// Chico a propósito para quedar lejos del timeout de las funciones de Vercel.
const PROCESS_BUDGET_MS = 6000;

export interface IngestProgress {
  id: string;
  status: 'processing' | 'ready';
  processed: number;
  total: number;
  // Presente cuando la API de embeddings pidió esperar antes de seguir.
  retryAfterMs?: number;
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'documento';
}

@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectModel(MaterialDocument.name) private docModel: Model<DocumentDoc>,
    @InjectModel(Chunk.name) private chunkModel: Model<ChunkDocument>,
    private gemini: GeminiService,
  ) {}

  async onModuleInit() {
    const count = await this.docModel.countDocuments();
    if (count === 0) {
      const mdFile = path.join(ASSETS_DIR, 'material.md');
      if (fs.existsSync(mdFile)) {
        this.logger.log('Seeding from assets/material.md...');
        await this.ingestFile(mdFile, 'material', 'Material de Cátedra');
      } else {
        this.logger.warn('assets/material.md not found — skipping seed');
      }
    }
  }

  async ingestFile(filePath: string, slug: string, title: string): Promise<DocumentDoc> {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.ingestContent(content, slug, title, path.basename(filePath));
  }

  // Ingesta completa en un solo paso (seed inicial). Las subidas desde el panel usan
  // startIngest + processNext por tandas, para no pasarse del tiempo máximo de Vercel.
  async ingestContent(content: string, slug: string, title: string, sourceFile: string): Promise<DocumentDoc> {
    const doc = await this.startIngest(content, slug, title, sourceFile);
    for (;;) {
      const progress = await this.processNext(String(doc._id));
      if (progress.status === 'ready') break;
      if (progress.retryAfterMs) await new Promise((r) => setTimeout(r, progress.retryAfterMs));
    }
    return (await this.docModel.findById(doc._id))!;
  }

  async startPdfIngest(buffer: Buffer, originalName: string): Promise<DocumentDoc> {
    const parser = new PDFParse({ data: buffer, CanvasFactory });
    const data = await parser.getText();
    await parser.destroy();
    return this.startPdfTextIngest(data.text, originalName);
  }

  // Texto de un PDF ya extraído (en el navegador, para no mandar el PDF entero y
  // chocar con el límite de ~4.5 MB por request de Vercel).
  async startPdfTextIngest(rawText: string, originalName: string): Promise<DocumentDoc> {
    const text = this.cleanPdfText(rawText);
    const title = path.basename(originalName, path.extname(originalName));
    const slug = slugify(title);
    return this.startIngest(`# ${title}\n\n${text}`, slug, title, `${slug}.md`);
  }

  private cleanPdfText(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\s*\d+\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Crea el documento en estado 'processing' con sus fragmentos todavía sin
  // embeddings. No toca la versión anterior: esa sigue activa hasta que la nueva termine.
  async startIngest(content: string, slug: string, title: string, sourceFile: string): Promise<DocumentDoc> {
    const chunks = this.chunkMarkdown(content);
    if (chunks.length === 0) {
      throw new BadRequestException(
        'El archivo no tiene texto para indexar. Si es un PDF escaneado (imágenes), hace falta pasarlo por OCR antes de subirlo.',
      );
    }

    // Best-effort local cache of the ingested text, for local debugging.
    // Harmless if this fails — e.g. a serverless deploy with a read-only filesystem.
    try {
      const destPath = path.join(ASSETS_DIR, sourceFile);
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
        fs.writeFileSync(destPath, content);
      }
    } catch (err: any) {
      this.logger.warn(`Could not cache to assets/ (read-only filesystem?): ${err.message}`);
    }

    // Un intento anterior que quedó a medias para el mismo archivo se descarta:
    // esta subida lo reemplaza.
    const stale = await this.docModel.find({ slug, status: 'processing' });
    if (stale.length > 0) {
      const staleIds = stale.map((d) => d._id);
      await this.chunkModel.deleteMany({ documentId: { $in: staleIds } } as any);
      await this.docModel.deleteMany({ _id: { $in: staleIds } });
    }

    const last = await this.docModel.findOne({ slug }).sort({ version: -1 });
    const version = last ? last.version + 1 : 1;

    const doc = await this.docModel.create({
      slug, title, sourceFile, version, ingestedAt: new Date(),
      status: 'processing', totalChunks: chunks.length, processedChunks: 0,
    });
    try {
      await this.chunkModel.insertMany(
        chunks.map(({ heading, text }, order) => ({ documentId: doc._id, order, heading, text })),
      );
    } catch (err) {
      await this.chunkModel.deleteMany({ documentId: doc._id } as any);
      await this.docModel.deleteOne({ _id: doc._id });
      throw err;
    }

    this.logger.log(`Started ingest of "${title}" v${version}: ${chunks.length} chunks`);
    return doc;
  }

  // Calcula embeddings de los fragmentos pendientes durante como mucho
  // PROCESS_BUDGET_MS y devuelve el progreso. El navegador la llama en loop
  // hasta que el documento queda 'ready'.
  async processNext(id: string): Promise<IngestProgress> {
    const doc = await this.docModel.findById(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status !== 'processing') return this.progressOf(doc, 'ready');

    const started = Date.now();
    while (Date.now() - started < PROCESS_BUDGET_MS) {
      const pending = await this.chunkModel
        .find({ documentId: doc._id, pendingEmbedding: { $exists: false }, embedding: { $exists: false } } as any)
        .sort({ order: 1 })
        .limit(EMBED_BATCH_SIZE)
        .select('_id text');
      if (pending.length === 0) {
        await this.finalize(doc);
        return this.progressOf(doc, 'ready');
      }

      let vectors: number[][];
      try {
        vectors = await this.gemini.embedBatch(pending.map((c) => c.text));
      } catch (err) {
        if (err instanceof EmbedRateLimitError) {
          await this.refreshProgress(doc);
          return { ...this.progressOf(doc, 'processing'), retryAfterMs: err.retryAfterMs };
        }
        throw err;
      }

      await this.chunkModel.bulkWrite(
        pending.map((c, i) => ({
          updateOne: { filter: { _id: c._id }, update: { $set: { pendingEmbedding: vectors[i] } } },
        })) as any,
      );
      await this.refreshProgress(doc);
      this.logger.log(`  "${doc.title}" v${doc.version}: ${doc.processedChunks}/${doc.totalChunks} chunks embedded`);
    }
    return this.progressOf(doc, 'processing');
  }

  private async refreshProgress(doc: DocumentDoc) {
    doc.processedChunks = await this.chunkModel.countDocuments({
      documentId: doc._id, pendingEmbedding: { $exists: true },
    } as any);
    await this.docModel.updateOne({ _id: doc._id }, { $set: { processedChunks: doc.processedChunks } });
  }

  // Publica la versión nueva de una sola vez y recién ahí borra las anteriores.
  private async finalize(doc: DocumentDoc) {
    await this.chunkModel.collection.updateMany(
      { documentId: doc._id, pendingEmbedding: { $exists: true } },
      [{ $set: { embedding: '$pendingEmbedding' } }, { $unset: 'pendingEmbedding' }],
    );
    doc.status = 'ready';
    doc.processedChunks = doc.totalChunks;
    await this.docModel.updateOne({ _id: doc._id }, { $set: { status: 'ready', processedChunks: doc.totalChunks } });

    const oldDocs = await this.docModel.find({ slug: doc.slug, _id: { $ne: doc._id } });
    if (oldDocs.length > 0) {
      const oldIds = oldDocs.map((d) => d._id);
      await this.chunkModel.deleteMany({ documentId: { $in: oldIds } } as any);
      await this.docModel.deleteMany({ _id: { $in: oldIds } });
    }
    this.logger.log(`Ingestion complete for "${doc.title}" v${doc.version}`);
  }

  private progressOf(doc: DocumentDoc, status: 'processing' | 'ready'): IngestProgress {
    return { id: String(doc._id), status, processed: doc.processedChunks, total: doc.totalChunks };
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.docModel.findById(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.chunkModel.deleteMany({ documentId: doc._id });
    await this.docModel.deleteOne({ _id: doc._id });
  }

  private chunkMarkdown(content: string): { heading: string; text: string }[] {
    const lines = content.split('\n');
    const sections: { heading: string; body: string }[] = [];
    let currentHeading = '';
    let currentBody: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        if (currentBody.join('\n').trim()) {
          sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
        }
        currentHeading = headingMatch[2].trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
    if (currentBody.join('\n').trim()) {
      sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
    }

    const chunks: { heading: string; text: string }[] = [];
    for (const section of sections) {
      const subChunks = this.splitBySize(section.body, CHUNK_SIZE, CHUNK_OVERLAP);
      for (const text of subChunks) {
        if (text.trim()) chunks.push({ heading: section.heading, text });
      }
    }
    return chunks;
  }

  private splitBySize(text: string, size: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + size, words.length);
      chunks.push(words.slice(start, end).join(' '));
      if (end === words.length) break;
      start = end - overlap;
    }
    return chunks;
  }
}
