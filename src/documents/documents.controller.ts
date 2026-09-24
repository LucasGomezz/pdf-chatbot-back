import {
  Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
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
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
        if (!['.md', '.txt', '.pdf'].includes(ext)) {
          return cb(new BadRequestException('Only .md, .txt or .pdf files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const originalName = fixFilenameEncoding(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    if (ext === '.pdf') {
      return this.ingest.ingestPdfFile(file.buffer, originalName);
    }
    const title = path.basename(originalName, ext);
    const content = file.buffer.toString('utf-8');
    return this.ingest.ingestContent(content, slugify(title), title, originalName);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.ingest.deleteDocument(id);
    return { ok: true };
  }
}
