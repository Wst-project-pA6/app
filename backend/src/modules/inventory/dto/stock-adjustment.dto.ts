import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum StockAdjustmentReasonCode {
  DAMAGE = 'DAMAGE',
  LOSS = 'LOSS',
  FOUND = 'FOUND',
  COUNT_CORRECTION = 'COUNT_CORRECTION',
  OTHER = 'OTHER',
}

export enum StockAdjustmentStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum StockAdjustmentDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class StockAdjustmentListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(StockAdjustmentStatus)
  status?: StockAdjustmentStatus;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  partId?: string;
}

export class StockAdjustmentCreateRequest {
  @IsUUID()
  storeId!: string;

  @IsUUID()
  partId!: string;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantityDelta!: number;

  @IsEnum(StockAdjustmentReasonCode)
  reasonCode!: StockAdjustmentReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StockAdjustmentDecisionRequest {
  @IsEnum(StockAdjustmentDecision)
  decision!: StockAdjustmentDecision;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
