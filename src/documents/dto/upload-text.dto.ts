import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UploadTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}
