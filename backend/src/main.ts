import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './core/filters/http-exception.filter';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('FiveSSaaSBootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Photos and documents are currently sent inline as base64 data URLs, so allow moderately large JSON bodies,
  // but cap them explicitly instead of relying on framework defaults.
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';

  // Behind a load balancer / reverse proxy set TRUST_PROXY (e.g. "1" or "loopback") so client IPs
  // (rate limiting, activity trail) come from X-Forwarded-For; otherwise the header is ignored.
  if (process.env.TRUST_PROXY) {
    const trust = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(trust) ? Number(trust) : trust === 'true' ? true : trust);
  }

  // Security headers. CSP is left to the web app (the API serves JSON and its own file responses set a
  // strict CSP); files must be loadable cross-origin by the web app, hence the resource policy.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // Global Middlewares & Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS
  // Comma-separated allow-list, e.g. CORS_ORIGIN="http://localhost:5173,https://app.example.com"
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
    // Lets the web app read the file name of report downloads
    exposedHeaders: ['Content-Disposition'],
    credentials: false,
  });

  // Swagger Documentation Setup
  const isProduction = process.env.NODE_ENV === 'production';
  const config = new DocumentBuilder()
    .setTitle('5S SaaS Platform — Phase 1 Masters API')
    .setDescription('Enterprise Multi-Tenant REST API for Organization, Roles, RBAC, and Centralized Location Masters.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  // API documentation is exposed only outside production
  if (!isProduction) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 5S SaaS Enterprise Backend running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`📚 Swagger OpenAPI Documentation available on: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
