import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Ingresá un email válido.' })
  email: string;

  @IsString({ message: 'Ingresá tu contraseña.' })
  password: string;
}
