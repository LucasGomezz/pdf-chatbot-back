import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ChunkDocument = Chunk & Document;

@Schema({ collection: 'PDFs' })
export class Chunk {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'MaterialDocument', required: true, index: true })
  documentId: Types.ObjectId;

  @Prop({ required: true }) order: number;
  @Prop({ default: '' }) heading: string;
  @Prop({ required: true }) text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];
}

export const ChunkSchema = SchemaFactory.createForClass(Chunk);
ChunkSchema.index({ documentId: 1, order: 1 });
