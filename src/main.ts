import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('bootstrap');

  configureApp(app, { webOrigin: config.getOrThrow<string>('app.webOrigin') });

  const docs = new DocumentBuilder()
    .setTitle('HiLabs API')
    .setDescription(
      'The HiLabs platform API. Observations are append-only, interpretations are versioned, ' +
        'and nothing here returns an intelligence score, type or ranking to a learner.',
    )
    .setVersion('1')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, docs));

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);

  logger.log(`API on http://localhost:${port}/api/v1`);
  logger.log(`Docs on http://localhost:${port}/docs`);
}

void bootstrap();
