import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum AssessmentResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NEEDS_IMPROVEMENT = 'NEEDS_IMPROVEMENT',
}

export enum SignOffStatus {
  PENDING = 'PENDING',
  SIGNED_OFF = 'SIGNED_OFF',
  RETURNED = 'RETURNED',
}

export enum SignOffDecision {
  SIGNED_OFF = 'SIGNED_OFF',
  RETURNED = 'RETURNED',
}

export class AssessmentCreateDto {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  studentId!: string;

  @IsUUID()
  taskId!: string;

  @IsEnum(AssessmentResult)
  result!: AssessmentResult;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  timeOnTaskMinutes!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  mentorNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  evidenceAttachmentIds?: string[];
}

export class AssessmentUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(AssessmentResult)
  result?: AssessmentResult;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  timeOnTaskMinutes?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  mentorNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  evidenceAttachmentIds?: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeReason!: string;
}

export class SignOffRequestDto {
  @IsEnum(SignOffDecision)
  decision!: SignOffDecision;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note?: string;
}

export class AssessmentListQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  from?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  to?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(AssessmentResult)
  result?: AssessmentResult;

  @IsOptional()
  @IsEnum(SignOffStatus)
  signOffStatus?: SignOffStatus;
}
