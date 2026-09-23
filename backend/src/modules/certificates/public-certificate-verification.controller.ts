import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CertificateVerificationRateLimiter } from './certificate-verification-rate-limiter';
import { CertificatesService } from './certificates.service';

/**
 * Public, unauthenticated, highest-risk endpoint in this module: a valid verification token is
 * the ONLY thing gating access to (limited) certificate data. Kept in its own controller/file
 * so the security boundary — no @Permissions, always @Public, always rate limited by remote IP —
 * is visible at a glance rather than mixed into the authenticated CertificatesController.
 */
@Controller('public/certificate-verifications')
export class PublicCertificateVerificationController {
  constructor(
    private readonly service: CertificatesService,
    private readonly rateLimiter: CertificateVerificationRateLimiter,
  ) {}

  @Get(':verificationToken')
  @Public()
  verify(
    @Param('verificationToken') verificationToken: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // The connection's actual remote address only — never a client-supplied header such as
    // X-Forwarded-For, which would let a caller reset their own limit at will.
    const ip = request.socket.remoteAddress ?? 'unknown';
    const result = this.rateLimiter.consume(ip);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many verification requests');
    }
    return this.service.verifyPublic(verificationToken);
  }
}
