import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GeminiService } from './gemini.service';
import { RetrieverService } from './retriever.service';
import { Chunk, ChunkSchema } from '../documents/chunk.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Chunk.name, schema: ChunkSchema }])],
  providers: [GeminiService, RetrieverService],
  exports: [GeminiService, RetrieverService],
})
export class RagModule {}
