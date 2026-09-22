import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Request, Response, NextFunction } from 'express';
import { RequestContext } from './common/request-context/request-context';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

export const API_PREFIX = 'api/v1';

/**
 * Applies the same global prefix, validation pipe, request-context middleware and exception
 * filter that `main.ts` uses at boot. Shared so in-process callers (the seed CLI, smoke tests)
 * exercise byte-identical request handling to the real running server, not a re-approximation
 * of it.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const requestContext = app.get(RequestContext);
  app.use((req: Request, res: Response, next: NextFunction) =>
    new RequestContextMiddleware(requestContext).use(req, res, next),
  );

  app.useGlobalFilters(new GlobalExceptionFilter(requestContext));
}

export function setupSwagger(app: INestApplication): void {
  const openApiPath = path.join(process.cwd(), 'docs', 'openapi', 'wst-openapi-frozen.yaml');
  const fileContent = fs.readFileSync(openApiPath, 'utf8');
  const parsedDocument = yaml.parse(fileContent);

  if (typeof parsedDocument !== 'object' || parsedDocument === null || Array.isArray(parsedDocument)) {
    throw new Error('Invalid OpenAPI document: parsed YAML is not an object');
  }

  SwaggerModule.setup('/api/docs', app, parsedDocument, {
    customSiteTitle: 'WST API Documentation',
  });
}

export function getConfiguredPort(app: INestApplication): number {
  const configService = app.get(ConfigService);
  return configService.get<number>('port') ?? 3000;
}
