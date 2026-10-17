import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Global app configuration, shared by main.ts and the e2e tests so the tests
 * run against exactly the same validation, error handling and security setup.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // unknown fields (e.g. createdById, status) → 400
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Merchant Onboarding API')
    .setDescription(
      'Merchant application lifecycle with role-based and object-level authorization, async risk review, and audit trail.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  return app;
}
