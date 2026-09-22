import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApprovalTierDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'minimumTotal must be a non-negative decimal string with up to 4 decimal places',
  })
  minimumTotal: string;

  @IsInt()
  @IsIn([1, 2], { message: 'requiredApprovals must be 1 or 2' })
  requiredApprovals: 1 | 2;
}

export class PurchaseApprovalPolicyUpdateDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ApprovalTierDto)
  tiers: ApprovalTierDto[];
}

export interface PurchaseApprovalPolicyResponse {
  version: number;
  currencyCode: string;
  tiers: {
    minimumTotal: string;
    requiredApprovals: 1 | 2;
  }[];
  updatedAt: string;
  updatedBy: string | null;
}
