import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AllowedStudentDocument = AllowedStudent & Document;

@Schema({ timestamps: true })
export class AllowedStudent {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;
}

export const AllowedStudentSchema = SchemaFactory.createForClass(AllowedStudent);
