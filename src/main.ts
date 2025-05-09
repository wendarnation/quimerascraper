// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Configurar validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configurar prefijo global para la API
  app.setGlobalPrefix('api');

  // Configurar Swagger para documentación
  const config = new DocumentBuilder()
    .setTitle('API Scraper de Zapatillas')
    .setDescription('API para el scraper de zapatillas')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Habilitar CORS
  app.enableCors();

  // Iniciar servidor
  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Aplicación iniciada en el puerto ${port}`);
}
bootstrap();
