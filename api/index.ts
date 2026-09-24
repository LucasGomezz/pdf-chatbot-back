import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import bcrypt from 'bcrypt';

const server = express();
let isBootstrapped = false;

async function bootstrap() {
  if (isBootstrapped) return server;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({ origin: process.env.CORS_ORIGIN || '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  await app.init();

  const users = app.get(UsersService);
  if (!(await users.existsAdmin())) {
    const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (email && password) {
      const hash = await bcrypt.hash(password, 10);
      await users.create(email, hash, 'admin');
    }
  }

  isBootstrapped = true;
  return server;
}

export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  app(req, res);
}
