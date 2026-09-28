import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatHistory, HistoryDocument } from './history.schema';

@Injectable()
export class HistoryService {
  constructor(@InjectModel(ChatHistory.name) private histModel: Model<HistoryDocument>) {}

  async save(userId: string, question: string, answer: string, sources: { chunkId: string; heading: string; snippet: string }[]) {
    return this.histModel.create({ userId: new Types.ObjectId(userId), question, answer, sources });
  }

  // Solo devuelve la consulta si pertenece al usuario: un id ajeno da 404 igual
  // que uno inexistente, para no revelar qué ids existen.
  async findOneForUser(id: string, userId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Consulta no encontrada');
    const item = await this.histModel
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .select('-__v');
    if (!item) throw new NotFoundException('Consulta no encontrada');
    return item;
  }

  async findByUser(userId: string, limit = 20) {
    return this.histModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v');
  }
}
