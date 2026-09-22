import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContext) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = this.generateOrExtractRequestId(req);

    this.requestContext.run({ requestId }, () => {
      res.setHeader('X-Request-Id', requestId);
      next();
    });
  }

  private generateOrExtractRequestId(req: Request): string {
    const existing = req.headers['x-request-id'];
    if (existing && typeof existing === 'string' && existing.length > 0) {
      return existing;
    }
    return this.generateRequestId();
  }

  private generateRequestId(): string {
    // Use crypto.randomUUID if available (Node 14.17+), otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random hex
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
  }
}