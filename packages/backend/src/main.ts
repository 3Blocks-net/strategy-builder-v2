import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');
  app.enableCors({ origin: frontendUrl, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pecunity API')
    .setDescription('Strategy Builder V2 — Vault Management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
}
bootstrap();
