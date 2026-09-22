import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MoneyDto } from '../../../common/dto/money.dto';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum ApprovalScope {
  INITIAL_WORK = 'INITIAL_WORK',
  ADDITIONAL_WORK = 'ADDITIONAL_WORK',
  SUBLET = 'SUBLET',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ApprovalMethod {
  IN_PERSON = 'IN_PERSON',
  PHONE = 'PHONE',
  MESSAGE = 'MESSAGE',
  EMAIL = 'EMAIL',
  SIGNED_FORM = 'SIGNED_FORM',
}

export enum ApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class JobApprovalCreateRequest {
  @IsEnum(ApprovalScope)
  scope!: ApprovalScope;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  estimatedAmount?: MoneyDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  workItemIds?: string[];
}

export class JobApprovalDecisionRequest {
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @IsEnum(ApprovalMethod)
  method!: ApprovalMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  approvedByName!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  evidenceAttachmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class JobApprovalListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsEnum(ApprovalScope)
  scope?: ApprovalScope;
}
