import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/user.schema';
import { AllowedStudent, AllowedStudentSchema } from './allowed-student.schema';
import { AllowedStudentsService } from './allowed-students.service';
import { AllowedStudentsController } from './allowed-students.controller';
import { LoginAttempt, LoginAttemptSchema } from './login-attempt.schema';
import { LoginAttemptsService } from './login-attempts.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN', '7d') as any) },
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AllowedStudent.name, schema: AllowedStudentSchema },
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
    ]),
  ],
  controllers: [AuthController, AllowedStudentsController],
  providers: [AuthService, JwtStrategy, RolesGuard, SuperAdminGuard, UsersService, AllowedStudentsService, LoginAttemptsService],
  exports: [AuthService, JwtModule, RolesGuard, UsersService],
})
export class AuthModule {}
