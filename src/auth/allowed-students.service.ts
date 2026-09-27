import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
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

export interface AllowedStudentEntry {
  email: string;
  isAdmin: boolean;
}

@Injectable()
export class AllowedStudentsService {
  constructor(
    @InjectModel(AllowedStudent.name) private model: Model<AllowedStudentDocument>,
    private config: ConfigService,
  ) {}

  private superAdminEmail(): string {
    return (this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL') || '').toLowerCase();
  }

  async isAllowed(email: string): Promise<boolean> {
    return !!(await this.model.exists({ email: email.toLowerCase().trim() }));
  }

  async findByEmail(email: string): Promise<AllowedStudentDocument | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() });
  }

  async list(): Promise<AllowedStudentEntry[]> {
    const docs = await this.model
      .find({ email: { $ne: this.superAdminEmail() } })
      .sort({ email: 1 });
    return docs.map((d) => ({ email: d.email, isAdmin: d.isAdmin }));
  }

  async add(rawEmails: string[]): Promise<{ added: number; skipped: number }> {
    const superAdmin = this.superAdminEmail();
    const normalized = normalizeEmails(rawEmails).filter((e) => e !== superAdmin);
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

  async setAdminFlag(email: string, isAdmin: boolean): Promise<void> {
    const normalized = email.toLowerCase().trim();
    if (normalized === this.superAdminEmail()) {
      throw new BadRequestException('No se puede modificar al super admin');
    }
    const doc = await this.model.findOne({ email: normalized });
    if (!doc) throw new NotFoundException('Email no encontrado en la lista');
    doc.isAdmin = isAdmin;
    await doc.save();
  }

  async remove(email: string): Promise<void> {
    await this.model.deleteOne({ email: email.toLowerCase().trim() });
  }

  async clear(): Promise<void> {
    await this.model.deleteMany({ email: { $ne: this.superAdminEmail() } });
  }
}
