import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { toCsv } from '../../common/reports/csv.util';
import { buildTextPdf } from '../../common/reports/pdf.util';
import { computeFilterFingerprint } from '../../common/reports/filter-fingerprint.util';
import { ReportFiltersDto } from '../../common/reports/report-filters.dto';
import { resolveScopeIds } from '../../common/reports/resolve-scope-ids.util';
import { resolveReportWindow, DateWindow } from '../../common/reports/resolve-window.util';
import type { AttachmentStorage } from '../../common/storage/attachment-storage';
import { EXPORT_STORAGE } from '../../common/storage/local-export-storage';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { signDownloadToken, verifyDownloadToken } from '../attachments/download-token.util';
import {
  DownloadAuthorizationDto,
  EXPORT_TYPE_PERMISSION,
  ExportFormat,
  ExportJobCreateRequestDto,
  ExportJobDto,
  ExportJobListQuery,
  ExportJobPageDto,
  ExportStatus,
  ExportType,
  SENSITIVE_EXPORT_TYPES,
} from './dto/export.dto';
import { ExportRowsService } from './export-rows.service';
import { ExportJobRow, ExportsRepository, packFiltersColumn, unpackFiltersColumn } from './exports.repository';

export const EXPORTS_CLOCK = Symbol('EXPORTS_CLOCK');
export const EXPORTS_SCHEDULER = Symbol('EXPORTS_SCHEDULER');
export type ExportsScheduler = (work: () => void | Promise<void>) => void;

const DOWNLOAD_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const DOWNLOAD_ROUTE_PATH = '/api/v1/exports/downloads';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');
const forbidden = (): AppError => new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');
const badRequest = (message: string): AppError => new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);
const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};
const exportNotReady = (): AppError => new AppError(HttpStatus.CONFLICT, ErrorCode.EXPORT_NOT_READY, 'Export is not ready for download');
const exportExpired = (): AppError => new AppError(HttpStatus.CONFLICT, ErrorCode.EXPORT_EXPIRED, 'Export has expired');

function page<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) },
  };
}

/**
 * Implements the export lifecycle (create/poll/expire) from the frozen contract: POST /exports
 * inserts a PENDING row and returns 202 immediately ("no unbounded synchronous exports"); actual
 * row generation happens out-of-band via the injected `scheduler` (setImmediate in production, a
 * synchronous callback in tests) so the HTTP request never blocks on it. GET /exports/{id} lets
 * the caller poll PENDING -> PROCESSING -> COMPLETED/FAILED. Download works exactly like
 * attachments (see attachments.service.ts): a short-lived signed URL, reusing the very same
 * HMAC signing secret and token scheme (signDownloadToken/verifyDownloadToken), issued only to
 * the export's own requester.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly repository: ExportsRepository,
    private readonly rowsService: ExportRowsService,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
    @Inject(EXPORT_STORAGE) private readonly storage: AttachmentStorage,
    @Inject(EXPORTS_CLOCK) private readonly clock: () => number,
    @Inject(EXPORTS_SCHEDULER) private readonly scheduler: ExportsScheduler,
  ) {}

  async list(query: ExportJobListQuery, actor: AuthenticatedPrincipal): Promise<ExportJobPageDto> {
    let result;
    try {
      result = await this.repository.list(actor.id, query);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SORT') throw badRequest('Unknown sort field');
      throw error;
    }
    return page(query, result.rows.map((row) => this.mapJob(row)), result.totalItems);
  }

  async get(exportJobId: string, actor: AuthenticatedPrincipal): Promise<ExportJobDto> {
    const row = await this.repository.findById(exportJobId);
    if (!row || row.requested_by !== actor.id) throw notFound();
    return this.mapJob(row);
  }

  async create(dto: ExportJobCreateRequestDto, actor: AuthenticatedPrincipal): Promise<ExportJobDto> {
    if (dto.exportType === ExportType.CUSTOMER_STATEMENT && !dto.customerId) {
      throw validationFailed('/customerId', 'REQUIRED', 'customerId is required for CUSTOMER_STATEMENT exports');
    }
    const requiredPermission = EXPORT_TYPE_PERMISSION[dto.exportType];
    if (!actor.permissions.includes(requiredPermission)) throw forbidden();

    const filters = dto.filters ?? {};
    const scopeIds = resolveScopeIds(filters.organizationScopeId, this.scopeService.allowedScopeIds(actor));
    const window = resolveReportWindow(filters, this.clock());

    if (dto.exportType === ExportType.CUSTOMER_STATEMENT) {
      const accessible = await this.repository.customerAccessible(dto.customerId!, scopeIds);
      if (!accessible) throw notFound();
    }

    const fingerprint = computeFilterFingerprint(filters, scopeIds);
    const sensitive = SENSITIVE_EXPORT_TYPES.has(dto.exportType);

    const job = await this.transaction.runInTransaction(async (client) => {
      const inserted = await this.repository.insert(client, {
        requestedBy: actor.id,
        exportType: dto.exportType,
        format: dto.format,
        filtersJson: packFiltersColumn(filters),
        filterFingerprint: fingerprint,
        sensitive,
        customerId: dto.customerId,
      });
      if (sensitive) {
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'EXPORT.CREATE',
          entityType: 'EXPORT_JOB',
          entityId: inserted.id,
          outcome: 'SUCCESS',
          summary: `Created a ${dto.exportType} export (${dto.format})`,
        });
      }
      return inserted;
    });

    this.scheduler(() =>
      this.process(job.id, dto.exportType, dto.format, scopeIds, window, filters, actor, dto.customerId).catch(() => {
        // process() already persists FAILED status on error; nothing more to do with a fire-and-forget failure.
      }),
    );

    return this.mapJob(job);
  }

  private async process(
    jobId: string,
    exportType: ExportType,
    format: ExportFormat,
    scopeIds: string[],
    window: DateWindow,
    filters: ReportFiltersDto,
    actor: AuthenticatedPrincipal,
    customerId: string | undefined,
  ): Promise<void> {
    await this.repository.markProcessing(jobId);
    try {
      const result = await this.rowsService.build(exportType, scopeIds, window, filters, actor, customerId);
      const buffer = format === ExportFormat.CSV
        ? Buffer.from(toCsv(result.headers, result.rows), 'utf8')
        : buildTextPdf(`${exportType} export`, [result.headers.join(' | '), ...result.rows.map((r) => r.join(' | '))]);
      const extension = format === ExportFormat.CSV ? 'csv' : 'pdf';
      const objectStorageKey = `${jobId}.${extension}`;
      await this.storage.put(objectStorageKey, buffer, format === ExportFormat.CSV ? 'text/csv' : 'application/pdf');

      const completedAt = new Date(this.clock());
      const expiresAt = new Date(completedAt.getTime() + this.retentionMs());
      await this.repository.markCompleted(jobId, {
        rowCount: result.rowCount,
        objectStorageKey,
        completedAt,
        expiresAt,
        filtersJson: packFiltersColumn(filters, result.totals),
      });
    } catch (error) {
      await this.repository.markFailed(jobId, error instanceof Error ? error.message : 'Export generation failed');
    }
  }

  async authorizeDownload(exportJobId: string, actor: AuthenticatedPrincipal): Promise<DownloadAuthorizationDto> {
    const row = await this.repository.findById(exportJobId);
    if (!row || row.requested_by !== actor.id) throw notFound();
    if (row.status === 'EXPIRED') throw exportExpired();
    if (row.status !== 'COMPLETED') throw exportNotReady();
    if (row.expires_at && row.expires_at.getTime() <= this.clock()) {
      await this.repository.markExpired(row.id);
      throw exportExpired();
    }

    const expiresAt = new Date(this.clock() + DOWNLOAD_AUTHORIZATION_TTL_MS);
    const authorizationId = await this.transaction.runInTransaction(async (client) => {
      const authorization = await this.repository.insertDownloadAuthorization(client, {
        exportJobId: row.id,
        issuedTo: actor.id,
        expiresAt,
      });
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'EXPORT.DOWNLOAD_AUTHORIZED',
        entityType: 'EXPORT_JOB',
        entityId: row.id,
        outcome: 'SUCCESS',
        summary: 'Issued a short-lived export download authorization',
      });
      return authorization.id;
    });

    const expiresAtMillis = expiresAt.getTime();
    const signature = signDownloadToken(authorizationId, actor.id, expiresAtMillis, this.signingSecret());
    const baseUrl = this.configService.get<string>('app.baseUrl') ?? 'http://localhost:3000';
    const url = `${baseUrl}${DOWNLOAD_ROUTE_PATH}/${authorizationId}?expires=${expiresAtMillis}&sig=${signature}`;
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Mirrors AttachmentsService.downloadByToken exactly: returns null for any invalid signature,
   * tampered expiry, wrong caller, unknown or expired authorization — the controller maps every
   * null to a plain 404 so a probing client cannot distinguish which case applies.
   */
  async downloadByToken(
    authorizationId: string,
    expiresParam: string | undefined,
    signature: string | undefined,
    actor: AuthenticatedPrincipal,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
    const expiresAtMillis = Number(expiresParam);
    if (
      typeof signature !== 'string' ||
      !verifyDownloadToken(authorizationId, actor.id, expiresAtMillis, signature, this.signingSecret())
    ) {
      return null;
    }
    if (expiresAtMillis <= this.clock()) return null;

    const authorization = await this.repository.findDownloadAuthorization(authorizationId);
    if (!authorization || authorization.expires_at.getTime() <= this.clock()) return null;
    if (authorization.issued_to !== actor.id) return null;

    const buffer = await this.storage.get(authorization.object_storage_key);
    const contentType = authorization.format === 'CSV' ? 'text/csv; charset=utf-8' : 'application/pdf';
    const fileName = `${authorization.export_type}.${authorization.format === 'CSV' ? 'csv' : 'pdf'}`;
    return { buffer, contentType, fileName };
  }

  /** Reuses attachments' signing secret deliberately — same HMAC download-token scheme, no new secret to provision. */
  private signingSecret(): string {
    const secret = this.configService.get<string>('attachments.signingSecret');
    if (!secret) throw new Error('Attachments signing secret is not configured');
    return secret;
  }

  private retentionMs(): number {
    return this.configService.get<number>('exports.retentionMs') ?? 24 * 60 * 60 * 1000;
  }

  private mapJob(row: ExportJobRow): ExportJobDto {
    const { requestFilters, totals } = unpackFiltersColumn(row.filters);
    return {
      id: row.id,
      exportType: row.export_type as ExportType,
      format: row.format as ExportFormat,
      status: row.status as ExportStatus,
      filters: requestFilters as Record<string, string | undefined>,
      filterFingerprint: row.filter_fingerprint,
      sensitive: row.sensitive,
      ...(row.customer_id ? { customerId: row.customer_id } : {}),
      ...(row.row_count !== null ? { rowCount: row.row_count } : {}),
      ...(totals ? { totals } : {}),
      ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
      ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
      ...(row.failure_message ? { failureMessage: row.failure_message } : {}),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      createdBy: row.requested_by,
      updatedBy: row.requested_by,
    };
  }
}
