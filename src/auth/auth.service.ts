import { Injectable, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AllowedStudentsService } from './allowed-students.service';

const NOT_ALLOWED_MESSAGE =
  'Tu email no está autorizado. Contactá a la cátedra si creés que es un error.';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private allowedStudents: AllowedStudentsService,
  ) {}

  async register(email: string, password: string) {
    const allowed = await this.allowedStudents.isAllowed(email);
    if (!allowed) throw new ForbiddenException(NOT_ALLOWED_MESSAGE);

    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create(email, passwordHash);

    return this.buildResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.role === 'student') {
      const allowed = await this.allowedStudents.isAllowed(user.email);
      if (!allowed) throw new ForbiddenException(NOT_ALLOWED_MESSAGE);
    }

    return this.buildResponse(user);
  }

  private buildResponse(user: any) {
    const payload = { sub: user._id.toString(), email: user.email, role: user.role };
    return {
      token: this.jwt.sign(payload),
      user: { id: user._id.toString(), email: user.email, role: user.role },
    };
  }
}
