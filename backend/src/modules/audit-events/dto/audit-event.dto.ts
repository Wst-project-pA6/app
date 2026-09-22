import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
  FAILED = 'FAILED',
}

export class AuditEventListQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  from?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  to?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;
}
