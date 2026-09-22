import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AttachmentRateLimiter } from './attachment-rate-limiter';
import { AttachmentsService } from './attachments.service';
import { AttachmentUploadDto } from './dto/attachment.dto';
import { UploadedFileLike } from './uploaded-file';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

/**
 * Builds a Content-Disposition value that cannot inject headers or be misread as a path:
 * the ASCII fallback strips anything but printable ASCII and escapes quotes/backslashes, and
 * the UTF-8 filename* form is percent-encoded per RFC 5987/6266. The file name is metadata
 * only — it never addresses storage.
 */
function contentDispositionHeader(fileName: string): string {
  const asciiSafe = fileName.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_');
  return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly service: AttachmentsService,
    private readonly rateLimiter: AttachmentRateLimiter,
  ) {}

  @Post()
  @Permissions('attachments.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: AttachmentUploadDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.rateLimiter.consumeUpload(actor.id);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many attachment uploads');
    }
    return this.service.upload(file, dto, actor);
  }

  /**
   * The actual content behind a DownloadAuthorization.url. Not part of the frozen OpenAPI
   * paths (that contract only specifies the opaque `url` string) — an internal signed-delivery
   * implementation route. Attachments are private: this route requires the same Bearer access
   * token as every other endpoint (global AuthGuard; no @Public()). The signed query
   * parameters bind the URL to the caller it was issued to (see download-token.util.ts); a
   * different authenticated caller presenting someone else's URL gets a plain 404, same as any
   * invalid, tampered or expired token, so a probing client learns nothing about which case
   * applies. Rate limited per remote IP (never a client-supplied header) independently of the
   * per-user upload/authorization-issuance limits.
   */
  @Get('downloads/:authorizationId')
  async download(
    @Param('authorizationId', new ParseUUIDPipe()) authorizationId: string,
    @Query('expires') expires: string | undefined,
    @Query('sig') sig: string | undefined,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const ip = request.socket.remoteAddress ?? 'unknown';
    const rateLimit = this.rateLimiter.consumeDownloadByIp(ip);
    if (!rateLimit.allowed) {
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many download requests');
    }

    const result = await this.service.downloadByToken(authorizationId, expires, sig, actor);
    if (!result) throw notFound();
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', contentDispositionHeader(result.fileName));
    response.send(result.buffer);
  }

  @Get(':attachmentId')
  get(
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(attachmentId, actor);
  }

  @Post(':attachmentId/download-authorizations')
  authorizeDownload(
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.rateLimiter.consumeDownloadAuthorization(actor.id);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many download authorization requests');
    }
    return this.service.authorizeDownload(attachmentId, actor);
  }
}
