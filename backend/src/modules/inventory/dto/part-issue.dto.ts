import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum PartIssueStatus {
  ISSUED = 'ISSUED',
  PARTIALLY_REVERSED = 'PARTIALLY_REVERSED',
  REVERSED = 'REVERSED',
}

export class PartIssueListQuery extends PaginationQuery {}

export class PartIssueCreateRequest {
  @IsUUID()
  partId!: string;

  @IsUUID()
  storeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;
}

export class PartIssueReversalRequest {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
