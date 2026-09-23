import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { ExportRateLimiter } from './export-rate-limiter';
import { ExportJobCreateRequestDto, ExportJobListQuery } from './dto/export.dto';
import { ExportsService } from './exports.service';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

function contentDispositionHeader(fileName: string): string {
  const asciiSafe = fileName.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_');
  return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@Controller('exports')
export class ExportsController {
  constructor(
    private readonly service: ExportsService,
    private readonly rateLimiter: ExportRateLimiter,
  ) {}

  @Get()
  @Permissions('exports.read')
  list(@Query() query: ExportJobListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post()
  @Permissions('exports.create')
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body() dto: ExportJobCreateRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.rateLimiter.consumeCreate(actor.id);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many export requests');
    }
    return this.service.create(dto, actor);
  }

  @Get(':exportJobId')
  @Permissions('exports.read')
  get(@Param('exportJobId', new ParseUUIDPipe()) exportJobId: string, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.get(exportJobId, actor);
  }

  @Post(':exportJobId/download-authorizations')
  @Permissions('exports.read')
  authorizeDownload(
    @Param('exportJobId', new ParseUUIDPipe()) exportJobId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.rateLimiter.consumeDownloadAuthorization(actor.id);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many download authorization requests');
    }
    return this.service.authorizeDownload(exportJobId, actor);
  }

  /**
   * The actual content behind a DownloadAuthorization.url — an internal signed-delivery route,
   * not part of the frozen OpenAPI paths, following the exact same pattern as
   * AttachmentsController.download.
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
}
