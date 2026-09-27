import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Solo el email definido en ADMIN_BOOTSTRAP_EMAIL puede pasar este guard,
// independientemente de si otros usuarios también tienen role: 'admin'.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    const superAdminEmail = this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL');
    if (!user?.email || !superAdminEmail) return false;
    return user.email.toLowerCase() === superAdminEmail.toLowerCase();
  }
}
