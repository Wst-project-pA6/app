import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { RequestContext } from '../../common/request-context/request-context';
import { AuthRepository } from './auth.repository';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly repository: AuthRepository,
    private readonly requestContext: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) throw this.unauthenticated(response);

    const payload = await this.verifyToken(token, response);
    const principal = await this.repository.findAuthenticatedPrincipal(payload.sub);
    if (!principal) throw this.unauthenticated(response);

    request.user = principal;
    this.requestContext.setUserId(principal.id);
    this.requestContext.setRoles(principal.roles);
    this.requestContext.setScopes(principal.organizationScopeIds);
    return true;
  }

  private async verifyToken(token: string, response: Response): Promise<{ sub: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: unknown; exp?: unknown }>(token, {
        secret: this.config.getOrThrow<string>('auth.jwtSecret'),
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow<string>('auth.issuer'),
        audience: this.config.getOrThrow<string>('auth.audience'),
        ignoreExpiration: false,
      });
      if (
        typeof payload.sub !== 'string' ||
        !UUID_PATTERN.test(payload.sub) ||
        typeof payload.exp !== 'number' ||
        !Number.isFinite(payload.exp) ||
        payload.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error('Invalid subject');
      }
      return { sub: payload.sub };
    } catch {
      throw this.unauthenticated(response);
    }
  }

  private extractBearerToken(authorization: string | string[] | undefined): string | null {
    if (typeof authorization !== 'string') return null;
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    return match?.[1] ?? null;
  }

  private unauthenticated(response: Response): UnauthorizedException {
    response.setHeader('WWW-Authenticate', 'Bearer');
    return new UnauthorizedException('Unauthenticated');
  }
}
