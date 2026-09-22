import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export class GoodsReceiptLineRequestDto {
  @IsNotEmpty()
  @IsUUID()
  purchaseOrderLineId: string;

  @IsInt()
  @Min(0)
  quantityReceived: number;

  @IsInt()
  @Min(0)
  quantityAccepted: number;

  @IsInt()
  @Min(0)
  quantityRejected: number;

  @ValidateIf((o) => o.quantityRejected > 0)
  @IsNotEmpty({
    message: 'rejectionReason is required when quantityRejected is greater than 0',
  })
  @IsString()
  @MaxLength(300)
  rejectionReason?: string;
}

export class GoodsReceiptCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryReference?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineRequestDto)
  lines: GoodsReceiptLineRequestDto[];
}

export class GoodsReceiptListQuery extends PaginationQuery {}

export interface GoodsReceiptLineResponse {
  purchaseOrderLineId: string;
  partId: string;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason?: string | null;
  stockMovementId?: string | null;
}

export interface GoodsReceiptResponse {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  storeId: string;
  deliveryReference?: string | null;
  receivedAt: string;
  lines: GoodsReceiptLineResponse[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
}

export interface GoodsReceiptPageResponse {
  items: GoodsReceiptResponse[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
