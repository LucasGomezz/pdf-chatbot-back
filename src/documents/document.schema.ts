import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DocumentDoc = MaterialDocument & Document;

@Schema({ timestamps: true })
export class MaterialDocument {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) sourceFile: string;
  @Prop({ default: 1 }) version: number;
  @Prop() ingestedAt: Date;

  // 'processing': todavía se están calculando los embeddings; no se usa en el chat
  // ni reemplaza a la versión anterior hasta pasar a 'ready'.
  @Prop({ type: String, enum: ['processing', 'ready'], default: 'ready' })
  status: 'processing' | 'ready';

  @Prop({ default: 0 }) totalChunks: number;
  @Prop({ default: 0 }) processedChunks: number;
}

export const MaterialDocumentSchema = SchemaFactory.createForClass(MaterialDocument);
MaterialDocumentSchema.index({ slug: 1, version: -1 });
