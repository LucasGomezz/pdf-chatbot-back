import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AllowedStudent, AllowedStudentDocument } from './allowed-student.schema';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmails(rawEmails: string[]): string[] {
  return Array.from(
    new Set(
      rawEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_REGEX.test(e)),
    ),
  );
}

@Injectable()
export class AllowedStudentsService {
  constructor(
    @InjectModel(AllowedStudent.name) private model: Model<AllowedStudentDocument>,
  ) {}

  async isAllowed(email: string): Promise<boolean> {
    return !!(await this.model.exists({ email: email.toLowerCase().trim() }));
  }

  async list(): Promise<string[]> {
    const docs = await this.model.find().sort({ email: 1 });
    return docs.map((d) => d.email);
  }

  async add(rawEmails: string[]): Promise<{ added: number; skipped: number }> {
    const normalized = normalizeEmails(rawEmails);
    if (normalized.length === 0) return { added: 0, skipped: rawEmails.length };

    const existing = await this.model.find({ email: { $in: normalized } }).lean();
    const existingSet = new Set(existing.map((d) => d.email));
    const toInsert = normalized.filter((e) => !existingSet.has(e));

    if (toInsert.length > 0) {
      await this.model.insertMany(toInsert.map((email) => ({ email })));
    }
    return { added: toInsert.length, skipped: rawEmails.length - toInsert.length };
  }

  async update(oldEmail: string, newEmail: string): Promise<void> {
    const normalizedNew = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedNew)) throw new BadRequestException('Email inválido');

    const doc = await this.model.findOne({ email: oldEmail.toLowerCase().trim() });
    if (!doc) throw new NotFoundException('Email no encontrado en la lista');

    if (doc.email === normalizedNew) return;

    const clash = await this.model.exists({ email: normalizedNew });
    if (clash) throw new ConflictException('Ese email ya está en la lista');

    doc.email = normalizedNew;
    await doc.save();
  }

  async remove(email: string): Promise<void> {
    await this.model.deleteOne({ email: email.toLowerCase().trim() });
  }

  async clear(): Promise<void> {
    await this.model.deleteMany({});
  }
}
