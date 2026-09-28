import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // El texto extraído de un PDF viaja como JSON; el default de Express (100 kb) no alcanza.
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');

  // Log every incoming request
  app.use((req: any, _res: any, next: any) => {
    console.log(`[HTTP] ${req.method} ${req.url}  auth=${req.headers['authorization']?.slice(0, 20) ?? 'none'}`);
    next();
  });

  await app.listen(process.env.PORT || 4000);

  const users = app.get(UsersService);
  // Se crea al super admin si todavía no existe su usuario. No alcanza con chequear
  // "si no hay ningún admin": los docentes también tienen role admin.
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (email && password && !(await users.findByEmail(email))) {
    const hash = await bcrypt.hash(password, 10);
    await users.create(email, hash, 'admin');
    console.log(`Admin created: ${email}`);
  }
}
bootstrap();
