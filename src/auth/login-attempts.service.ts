import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoginAttempt, LoginAttemptDocument } from './login-attempt.schema';

export const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class LoginAttemptsService {
  constructor(@InjectModel(LoginAttempt.name) private model: Model<LoginAttemptDocument>) {}

  async assertNotLocked(email: string): Promise<void> {
    const doc = await this.model.findOne({ email: email.toLowerCase().trim() });
    if (doc?.lockedUntil && doc.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((doc.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Demasiados intentos fallidos. Probá de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Suma un intento fallido; al llegar al máximo bloquea el email por LOCK_MS.
  async registerFailure(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const now = Date.now();
    const doc = await this.model.findOneAndUpdate(
      { email: normalized },
      { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date(now + WINDOW_MS) } },
      { upsert: true, new: true },
    );
    if (doc.count >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(now + LOCK_MS);
      await this.model.updateOne({ _id: doc._id }, { $set: { lockedUntil, expireAt: lockedUntil } });
    }
  }

  async reset(email: string): Promise<void> {
    await this.model.deleteOne({ email: email.toLowerCase().trim() });
  }
}
