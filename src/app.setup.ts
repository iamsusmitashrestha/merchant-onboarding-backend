import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { EnvironmentVariables } from './config/env.validation';
import { swaggerEnabled } from './config/swagger';

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
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  if (swaggerEnabled(nodeEnv, config.get('SWAGGER_ENABLED', { infer: true }))) {
    setUpSwagger(app);
  }
  return app;
}

function setUpSwagger(app: INestApplication): void {
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
}
