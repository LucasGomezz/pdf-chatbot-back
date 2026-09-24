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
}

export const MaterialDocumentSchema = SchemaFactory.createForClass(MaterialDocument);
