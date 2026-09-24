import { IsEmail } from 'class-validator';

export class UpdateStudentDto {
  @IsEmail()
  newEmail: string;
}
