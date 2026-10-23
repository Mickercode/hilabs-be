import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * Everything that makes the running app behave the way production does.
 *
 * It lives here rather than in main.ts so the end-to-end tests configure the app exactly as the
 * server does. When they each built their own ValidationPipe, the tests ran without
 * forbidNonWhitelisted and quietly stripped unexpected fields that production rejects, which is
 * precisely the kind of difference a test suite is supposed to catch.
 */
export function configureApp(app: INestApplication, options: { webOrigin: string }): void {
  app.use(helmet());
  // The session lives in an httpOnly cookie, so the guard needs it parsed.
  app.use(cookieParser());
  app.enableCors({ origin: options.webOrigin, credentials: true });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Onboarding must never quietly accept a field it should not have been sent. An unknown
      // property is an error, not something to drop (R2).
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();
}
