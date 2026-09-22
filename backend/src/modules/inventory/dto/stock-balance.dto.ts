import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum StockMovementType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  RECEIPT = 'RECEIPT',
  ISSUE = 'ISSUE',
  ISSUE_REVERSAL = 'ISSUE_REVERSAL',
  RESERVATION = 'RESERVATION',
  RESERVATION_RELEASE = 'RESERVATION_RELEASE',
  ADJUSTMENT = 'ADJUSTMENT',
}

export function IsLevelsOrderValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isLevelsOrderValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as { minLevel?: number; maxLevel?: number };
          if (obj.minLevel !== undefined && obj.maxLevel !== undefined) {
            return obj.maxLevel >= obj.minLevel;
          }
          return true;
        },
        defaultMessage: () => 'maxLevel must be greater than or equal to minLevel',
      },
    });
  };
}

export class StockLevelsUpdateRequest {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minLevel!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsLevelsOrderValid()
  maxLevel!: number;
}

export class StockBalanceListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  partId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  belowMinimum?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  stockedOut?: boolean;
}

export class StockReconciliationQuery {
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class StockMovementListQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  partId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID()
  goodsReceiptId?: string;

  @IsOptional()
  @IsUUID()
  stockAdjustmentId?: string;
}
