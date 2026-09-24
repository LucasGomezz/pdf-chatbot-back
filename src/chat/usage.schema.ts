import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserUsageDocument = UserUsage & Document;

@Schema({ timestamps: true })
export class UserUsage {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) date: string;
  @Prop({ default: 0 }) count: number;
}

export const UserUsageSchema = SchemaFactory.createForClass(UserUsage);
UserUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

export type GlobalUsageDocument = GlobalUsage & Document;

@Schema({ timestamps: true })
export class GlobalUsage {
  @Prop({ required: true, unique: true }) date: string;
  @Prop({ default: 0 }) count: number;
}

export const GlobalUsageSchema = SchemaFactory.createForClass(GlobalUsage);
