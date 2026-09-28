import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  // Solo el super admin puede editar o borrar a un docente; los docentes
  // gestionan alumnos pero no pueden tocarse entre ellos.
  private async assertCanModify(email: string, requesterEmail: string): Promise<AllowedStudentDocument | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase().trim() });
    if (doc?.isAdmin && requesterEmail.toLowerCase() !== this.superAdminEmail()) {
      throw new ForbiddenException('Solo el super admin puede modificar a un docente');
    }
    return doc;
  }

  // Autoriza emails como docentes: los agrega si no estaban y los marca como admin.
  // Devuelve los emails normalizados para que el caller actualice el rol del usuario.
  async addTeachers(rawEmails: string[]): Promise<{ emails: string[]; added: number; promoted: number }> {
    const normalized = normalizeEmails(rawEmails).filter((e) => e !== this.superAdminEmail());
    if (normalized.length === 0) return { emails: [], added: 0, promoted: 0 };

    const existing = await this.model.find({ email: { $in: normalized } }).lean();
    const existingSet = new Set(existing.map((d) => d.email));
    const toInsert = normalized.filter((e) => !existingSet.has(e));
    const promoted = existing.filter((d) => !d.isAdmin).length;

    if (toInsert.length > 0) {
      await this.model.insertMany(toInsert.map((email) => ({ email, isAdmin: true })));
    }
    await this.model.updateMany({ email: { $in: normalized } }, { $set: { isAdmin: true } });
    return { emails: normalized, added: toInsert.length, promoted };
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

  async update(oldEmail: string, newEmail: string, requesterEmail: string): Promise<void> {
    const normalizedNew = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedNew)) throw new BadRequestException('Email inválido');

    const doc = await this.assertCanModify(oldEmail, requesterEmail);
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

  // Devuelve si el email borrado era docente, para que el caller le quite el rol.
  async remove(email: string, requesterEmail: string): Promise<{ wasAdmin: boolean }> {
    const doc = await this.assertCanModify(email, requesterEmail);
    if (!doc) return { wasAdmin: false };
    await doc.deleteOne();
    return { wasAdmin: doc.isAdmin };
  }

  // Borra solo alumnos: los docentes se gestionan aparte desde su propia pestaña.
  async clear(): Promise<void> {
    await this.model.deleteMany({ email: { $ne: this.superAdminEmail() }, isAdmin: { $ne: true } });
  }
}
