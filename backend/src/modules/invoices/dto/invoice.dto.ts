import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  VOID = 'VOID',
}

export enum DiscountType {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export enum InvoiceLineType {
  LABOR = 'LABOR',
  PART = 'PART',
  SUBLET = 'SUBLET',
}

export enum InvoiceSourceType {
  LABOR_ENTRY = 'LABOR_ENTRY',
  PART_ISSUE = 'PART_ISSUE',
  SUBLET_ENTRY = 'SUBLET_ENTRY',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  OTHER = 'OTHER',
}

export class MoneyDto {
  @IsString()
  @Matches(/^-?[0-9]{1,12}(\.[0-9]{1,4})?$/)
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;
}

export class DiscountDto {
  @IsEnum(DiscountType)
  type: DiscountType;

  @IsString()
  @Matches(/^-?[0-9]+(\.[0-9]+)?$/)
  value: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export interface InvoiceLineDto {
  id: string;
  lineType: InvoiceLineType;
  description: string;
  quantity: string;
  unitPrice: MoneyDto;
  lineTotal: MoneyDto;
  sourceType: InvoiceSourceType;
  sourceId: string;
}

export interface InvoiceTotalsDto {
  laborSubtotal: MoneyDto;
  partsSubtotal: MoneyDto;
  subletSubtotal: MoneyDto;
  subtotal: MoneyDto;
  discountTotal: MoneyDto;
  taxableAmount: MoneyDto;
  taxRatePercent: string;
  taxAmount: MoneyDto;
  total: MoneyDto;
}

export interface PaymentReferenceDto {
  id: string;
  invoiceId: string;
  method: PaymentMethod;
  reference: string;
  amount: MoneyDto;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber?: string;
  jobId: string;
  jobNumber: string;
  customerId: string;
  status: InvoiceStatus;
  currencyCode: string;
  lines: InvoiceLineDto[];
  discount?: DiscountDto;
  totals: InvoiceTotalsDto;
  payments: PaymentReferenceDto[];
  notes?: string;
  issuedAt?: string;
  paidAt?: string;
  voidReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface PageInfoDto {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InvoicePageDto {
  items: InvoiceDto[];
  page: PageInfoDto;
}

export interface InvoiceSummaryDto {
  jobId: string;
  jobStage: string;
  currencyCode: string;
  lines: InvoiceLineDto[];
  totals: InvoiceTotalsDto;
  calculatedAt: string;
}

export class InvoiceListQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoiceNumber?: string;
}

export class InvoiceUpdateRequestDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class InvoiceTransitionRequestDto {
  @IsEnum(['ISSUED', 'VOID'])
  toStatus: 'ISSUED' | 'VOID';

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class PaymentCreateRequestDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reference: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  amount: MoneyDto;

  @IsDateString()
  paidAt: string;
}

export interface StatementLineDto {
  invoiceId: string;
  invoiceNumber?: string;
  jobNumber: string;
  issuedAt?: string;
  status: InvoiceStatus;
  total: MoneyDto;
  paidAmount: MoneyDto;
}

export interface CustomerStatementDto {
  customerId: string;
  customerDisplayName: string;
  from?: string;
  to?: string;
  currencyCode: string;
  lines: StatementLineDto[];
  totalInvoiced: MoneyDto;
  totalPaid: MoneyDto;
  totalOutstanding: MoneyDto;
  generatedAt: string;
}

export class CustomerStatementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
