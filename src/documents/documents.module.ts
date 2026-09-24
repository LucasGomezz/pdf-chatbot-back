import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialDocument, MaterialDocumentSchema } from './document.schema';
import { Chunk, ChunkSchema } from './chunk.schema';
import { DocumentsController } from './documents.controller';
import { IngestService } from './ingest.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialDocument.name, schema: MaterialDocumentSchema },
      { name: Chunk.name, schema: ChunkSchema },
    ]),
    RagModule,
  ],
  controllers: [DocumentsController],
  providers: [IngestService],
  exports: [IngestService, MongooseModule],
})
export class DocumentsModule {}
