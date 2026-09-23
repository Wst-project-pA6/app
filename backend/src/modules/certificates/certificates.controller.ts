import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CertificateIssueDto, CertificateListQuery, RevokeCertificateDto } from './dto/certificate.dto';
import { CertificatesService } from './certificates.service';

function validateIdempotencyKey(idempotencyKey?: string): void {
  if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
    throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, 'Invalid Idempotency-Key header length');
  }
}

@Controller()
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Get('certificates')
  @Permissions('training.read', 'students.self')
  list(@Query() query: CertificateListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('certificates')
  @Permissions('certificates.issue')
  create(
    @Body() dto: CertificateIssueDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    validateIdempotencyKey(idempotencyKey);
    return this.service.issue(dto, actor, idempotencyKey);
  }

  @Get('certificates/:certificateId')
  @Permissions('training.read', 'students.self')
  get(
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(certificateId, actor);
  }

  @Post('certificates/:certificateId/revocations')
  @HttpCode(HttpStatus.OK)
  @Permissions('certificates.revoke')
  revoke(
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Body() dto: RevokeCertificateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.revoke(certificateId, dto, actor);
  }
}
