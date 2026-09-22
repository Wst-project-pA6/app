import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export class PurchaseApprovalRequestDto {
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'], {
    message: 'decision must be APPROVED or REJECTED',
  })
  decision: 'APPROVED' | 'REJECTED';

  @ValidateIf((o) => o.decision === 'REJECTED')
  @IsNotEmpty({ message: 'reason is required when rejecting a purchase order' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class PurchaseApprovalListQuery extends PaginationQuery {}

export interface PurchaseApprovalResponse {
  id: string;
  purchaseOrderId: string;
  approverId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  decidedAt: string;
}

export interface PurchaseApprovalPageResponse {
  items: PurchaseApprovalResponse[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
