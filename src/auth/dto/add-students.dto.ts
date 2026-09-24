import { IsArray, IsString } from 'class-validator';

export class AddStudentsDto {
  @IsArray()
  @IsString({ each: true })
  emails: string[];
}
