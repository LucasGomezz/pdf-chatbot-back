import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async create(email: string, passwordHash: string, role: UserRole = 'student'): Promise<UserDocument> {
    return this.userModel.create({ email, passwordHash, role });
  }

  async existsAdmin(): Promise<boolean> {
    return !!(await this.userModel.exists({ role: 'admin' }));
  }
}
