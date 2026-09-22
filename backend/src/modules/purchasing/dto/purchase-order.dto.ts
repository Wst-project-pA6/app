import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export class MoneyDto {
  @IsString()
  @Matches(/^[0-9]{1,12}(\.[0-9]{1,4})?$/, {
    message: 'amount must be a non-negative decimal string with up to 4 decimal places',
  })
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO code',
  })
  currency: string;
}

export class PurchaseOrderLineRequestDto {
  @IsNotEmpty()
  @IsUUID()
  partId: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  quantityOrdered: number;

  @ValidateNested()
  @Type(() => MoneyDto)
  unitCost: MoneyDto;
}

export class PurchaseOrderCreateDto {
  @IsNotEmpty()
  @IsUUID()
  vendorId: string;

  @IsNotEmpty()
  @IsUUID()
  storeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineRequestDto)
  lines: PurchaseOrderLineRequestDto[];

  @IsOptional()
  @IsUUID()
  sourcePredictionId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expectedDeliveryDate must be in YYYY-MM-DD format',
  })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PurchaseOrderUpdateDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineRequestDto)
  lines?: PurchaseOrderLineRequestDto[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expectedDeliveryDate must be in YYYY-MM-DD format',
  })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PurchaseOrderTransitionDto {
  @IsNotEmpty()
  @IsIn(['PENDING_APPROVAL', 'CANCELLED'], {
    message: 'toStatus must be PENDING_APPROVAL or CANCELLED',
  })
  toStatus: 'PENDING_APPROVAL' | 'CANCELLED';

  @ValidateIf((o) => o.toStatus === 'CANCELLED')
  @IsNotEmpty({ message: 'reason is required when transitioning to CANCELLED' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class PurchaseOrderListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn([
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
  ])
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  poNumber?: string;
}

export interface PurchaseOrderLineResponse {
  id: string;
  lineNumber: number;
  partId: string;
  sku: string;
  quantityOrdered: number;
  quantityAccepted: number;
  quantityRejected: number;
  unitCost: {
    amount: string;
    currency: string;
  };
  lineTotal: {
    amount: string;
    currency: string;
  };
}

export interface PurchaseOrderResponse {
  id: string;
  poNumber: string;
  vendorId: string;
  storeId: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLineResponse[];
  total: {
    amount: string;
    currency: string;
  };
  requiredApprovals: 1 | 2 | null;
  approvalsRecorded: number;
  sourcePredictionId?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  submittedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
}

export interface PurchaseOrderPageResponse {
  items: PurchaseOrderResponse[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
