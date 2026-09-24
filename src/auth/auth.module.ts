import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { WsJwtGuard } from './ws-jwt.guard';
import { RolesGuard } from './roles.guard';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/user.schema';
import { AllowedStudent, AllowedStudentSchema } from './allowed-student.schema';
import { AllowedStudentsService } from './allowed-students.service';
import { AllowedStudentsController } from './allowed-students.controller';

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
    ]),
  ],
  controllers: [AuthController, AllowedStudentsController],
  providers: [AuthService, JwtStrategy, WsJwtGuard, RolesGuard, UsersService, AllowedStudentsService],
  exports: [AuthService, JwtModule, WsJwtGuard, RolesGuard, UsersService],
})
export class AuthModule {}
