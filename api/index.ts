import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import bcrypt from 'bcrypt';

const server = express();
let isBootstrapped = false;

async function bootstrap() {
  if (isBootstrapped) return server;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({ origin: process.env.CORS_ORIGIN || '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // El texto extraído de un PDF viaja como JSON; el default de Express (100 kb) no alcanza.
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');

  await app.init();

  const users = app.get(UsersService);
  // Se crea al super admin si todavía no existe su usuario. No alcanza con chequear
  // "si no hay ningún admin": los docentes también tienen role admin.
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (email && password && !(await users.findByEmail(email))) {
    const hash = await bcrypt.hash(password, 10);
    await users.create(email, hash, 'admin');
  }

  isBootstrapped = true;
  return server;
}

export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  app(req, res);
}
