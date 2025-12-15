import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS for development
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(
    `🚀 Invoicing Pipeline API running on http://localhost:${port}/api/v1`,
  );
}

void bootstrap();
