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

  // Solo lo tienen los fragmentos de documentos ya terminados: el índice vectorial
  // de Atlas indexa este campo, así que un documento a medio procesar no aparece
  // en las búsquedas del chat.
  @Prop({ type: [Number], default: undefined })
  embedding?: number[];

  // Embedding calculado mientras el documento sigue en proceso. Al terminar se
  // mueve a `embedding` de una sola vez.
  @Prop({ type: [Number], default: undefined })
  pendingEmbedding?: number[];
}

export const ChunkSchema = SchemaFactory.createForClass(Chunk);
ChunkSchema.index({ documentId: 1, order: 1 });
