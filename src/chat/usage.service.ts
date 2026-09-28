import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { UserUsage, UserUsageDocument, GlobalUsage, GlobalUsageDocument } from './usage.schema';

export type QuotaCheck = { allowed: true } | { allowed: false; reason: 'user' | 'global' };

// El día se cuenta en hora argentina: con UTC el contador se reiniciaba a las 21:00.
const QUOTA_TIMEZONE = 'America/Argentina/Buenos_Aires';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: QUOTA_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

function todayKey(): string {
  return dayFormatter.format(new Date()); // YYYY-MM-DD
}

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(UserUsage.name) private userUsageModel: Model<UserUsageDocument>,
    @InjectModel(GlobalUsage.name) private globalUsageModel: Model<GlobalUsageDocument>,
    private config: ConfigService,
  ) {}

  async checkAndIncrement(userId: string): Promise<QuotaCheck> {
    const date = todayKey();
    const dailyLimit = this.config.get<number>('DAILY_QUERY_LIMIT', 5);
    const globalLimit = this.config.get<number>('GLOBAL_DAILY_LIMIT', 800);

    const userUsage = await this.userUsageModel.findOneAndUpdate(
      { userId, date },
      { $inc: { count: 1 } },
      { upsert: true, new: true },
    );
    if (userUsage.count > dailyLimit) {
      return { allowed: false, reason: 'user' };
    }

    const globalUsage = await this.globalUsageModel.findOneAndUpdate(
      { date },
      { $inc: { count: 1 } },
      { upsert: true, new: true },
    );
    if (globalUsage.count > globalLimit) {
      return { allowed: false, reason: 'global' };
    }

    return { allowed: true };
  }

  // Devuelve la consulta cuando la respuesta falló por un problema nuestro o del
  // proveedor, para que el alumno no pierda cupo por algo que no es culpa suya.
  async refund(userId: string): Promise<void> {
    const date = todayKey();
    await Promise.all([
      this.userUsageModel.updateOne({ userId, date, count: { $gt: 0 } }, { $inc: { count: -1 } }),
      this.globalUsageModel.updateOne({ date, count: { $gt: 0 } }, { $inc: { count: -1 } }),
    ]);
  }
}
