import {
  Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IngestService, slugify } from './ingest.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialDocument, DocumentDoc } from './document.schema';
import { UploadTextDto } from './dto/upload-text.dto';

// Tope de Vercel por request (~4.5 MB); localmente no aplica, pero se mantiene
// igual para que lo que anda en local ande también en producción.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// multer/busboy decodes multipart filename headers as latin1 even when the
// browser sent UTF-8, mangling accented characters (á, é, í, ó, ú, ñ).
// Re-interpreting the bytes as UTF-8 recovers the original filename.
function fixFilenameEncoding(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/documents')
export class DocumentsController {
  constructor(
    private ingest: IngestService,
    @InjectModel(MaterialDocument.name) private docModel: Model<DocumentDoc>,
  ) {}

  @Get()
  async list() {
    return this.docModel.find().sort({ ingestedAt: -1 });
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
        if (!['.md', '.txt', '.pdf'].includes(ext)) {
          return cb(new BadRequestException('Solo se aceptan archivos .pdf, .md o .txt'), false);
        }
        cb(null, true);
      },
    }),
  )
  // Las subidas solo crean el documento en estado 'processing'; los embeddings se
  // calculan después con llamadas cortas a POST :id/process.
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const originalName = fixFilenameEncoding(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const doc = ext === '.pdf'
      ? await this.ingest.startPdfIngest(file.buffer, originalName)
      : await this.ingest.startIngest(
        file.buffer.toString('utf-8'), slugify(path.basename(originalName, ext)),
        path.basename(originalName, ext), originalName,
      );
    return this.ingest.processNext(String(doc._id));
  }

  @Post('upload-text')
  async uploadText(@Body() dto: UploadTextDto) {
    if (path.extname(dto.fileName).toLowerCase() !== '.pdf') {
      throw new BadRequestException('Acá solo se acepta el texto extraído de un archivo .pdf');
    }
    const doc = await this.ingest.startPdfTextIngest(dto.text, dto.fileName);
    return this.ingest.processNext(String(doc._id));
  }

  @Post(':id/process')
  async process(@Param('id') id: string) {
    return this.ingest.processNext(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.ingest.deleteDocument(id);
    return { ok: true };
  }
}
