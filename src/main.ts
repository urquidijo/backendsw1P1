import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Increase body size limit for image uploads (base64 images can be large)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // CORS configuration
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  const port = configService.get('PORT', 3001);
  const server = await app.listen(port);

  // Increase timeout for image processing (3 minutes)
  server.setTimeout(180000);

  console.log(`🚀 UML Platform Backend running on port ${port}`);
}

bootstrap();