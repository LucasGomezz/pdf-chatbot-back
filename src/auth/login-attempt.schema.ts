import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LoginAttemptDocument = LoginAttempt & Document;

// Intentos fallidos de login por email. Vive en la base (no en memoria) porque en
// Vercel cada request puede caer en una instancia distinta.
@Schema()
export class LoginAttempt {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ default: 0 })
  count: number;

  @Prop()
  lockedUntil?: Date;

  // MongoDB borra el registro solo cuando pasa esta fecha.
  @Prop({ required: true })
  expireAt: Date;
}

export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);
LoginAttemptSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
