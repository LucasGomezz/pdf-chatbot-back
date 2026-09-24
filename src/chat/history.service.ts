import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatHistory, HistoryDocument } from './history.schema';

@Injectable()
export class HistoryService {
  constructor(@InjectModel(ChatHistory.name) private histModel: Model<HistoryDocument>) {}

  async save(userId: string, question: string, answer: string, sources: { chunkId: string; heading: string; snippet: string }[]) {
    return this.histModel.create({ userId: new Types.ObjectId(userId), question, answer, sources });
  }

  async findByUser(userId: string, limit = 20) {
    return this.histModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v');
  }
}
