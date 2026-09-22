import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum QualityCheckResult {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

export class QualityCheckCreateRequest {
  @IsEnum(QualityCheckResult)
  result!: QualityCheckResult;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  evidenceAttachmentIds?: string[];
}

export class QualityCheckListQuery extends PaginationQuery {}
