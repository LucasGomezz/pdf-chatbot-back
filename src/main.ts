import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  // Log every incoming request
  app.use((req: any, _res: any, next: any) => {
    console.log(`[HTTP] ${req.method} ${req.url}  auth=${req.headers['authorization']?.slice(0, 20) ?? 'none'}`);
    next();
  });

  await app.listen(process.env.PORT || 4000);

  // Bootstrap admin user if none exists
  const users = app.get(UsersService);
  if (!(await users.existsAdmin())) {
    const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (email && password) {
      const hash = await bcrypt.hash(password, 10);
      await users.create(email, hash, 'admin');
      console.log(`Admin created: ${email}`);
    }
  }
}
bootstrap();
