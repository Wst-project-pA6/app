import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/**
 * Matches the OpenAPI ReportFilters schema exactly (`additionalProperties: false`, enforced by
 * the global ValidationPipe's forbidNonWhitelisted). Used both as the flattened query DTO for
 * the four GET /dashboards/* endpoints (ReportFilterQuery: style form, explode true — each field
 * is its own query parameter) and, unchanged, as the nested `filters` object of
 * ExportJobCreateRequest, so a dashboard call and an export created with the identical filter
 * values always produce the same filterFingerprint (see filter-fingerprint.util.ts).
 */
export class ReportFiltersDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  organizationScopeId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  bayId?: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}
