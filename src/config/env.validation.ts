import { plainToInstance } from 'class-transformer';
import { IsString, IsOptional, IsInt, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString() MONGODB_URI: string;
  @IsString() JWT_SECRET: string;
  @IsOptional() @IsString() JWT_EXPIRES_IN: string = '7d';
  @IsString() GEMINI_API_KEY: string;
  @IsOptional() @IsString() GEMINI_CHAT_MODEL: string = 'gemini-2.0-flash';
  @IsOptional() @IsString() GEMINI_EMBED_MODEL: string = 'text-embedding-004';
  @IsOptional() @IsString() ADMIN_BOOTSTRAP_EMAIL: string;
  @IsOptional() @IsString() ADMIN_BOOTSTRAP_PASSWORD: string;
  @IsOptional() @IsString() CORS_ORIGIN: string = 'http://localhost:3000';
  @IsOptional() @IsInt() DAILY_QUERY_LIMIT: number = 5;
  @IsOptional() @IsInt() GLOBAL_DAILY_LIMIT: number = 800;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) throw new Error(errors.toString());
  return validated;
}
