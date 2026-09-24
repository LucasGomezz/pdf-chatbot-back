import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { UserUsage, UserUsageDocument, GlobalUsage, GlobalUsageDocument } from './usage.schema';

export type QuotaCheck = { allowed: true } | { allowed: false; reason: 'user' | 'global' };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
}
