import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AllowedStudentsService } from './allowed-students.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private users: UsersService,
    private allowedStudents: AllowedStudentsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  // El rol y la autorización se leen de la base en cada request (no del token)
  // para que quitarle permisos a un docente o sacar a un alumno de la lista
  // tenga efecto inmediato, sin esperar a que venza el JWT.
  async validate(payload: JwtPayload) {
    const user = await this.users.findByEmail(payload.email);
    if (!user) throw new UnauthorizedException();
    const superAdminEmail = (this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL') || '').toLowerCase();
    const isSuperAdmin = !!superAdminEmail && user.email === superAdminEmail;
    if (!isSuperAdmin && !(await this.allowedStudents.isAllowed(user.email))) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: user.email, role: user.role, isSuperAdmin };
  }
}
