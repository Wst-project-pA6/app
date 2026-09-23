import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum TrainingSessionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateTrainingSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  groupId!: string;

  @IsUUID()
  bayId!: string;

  @IsUUID()
  mentorId!: string;

  @IsDateString()
  @Matches(/Z$/u)
  startsAt!: string;

  @IsDateString()
  @Matches(/Z$/u)
  endsAt!: string;
}

export class UpdateTrainingSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  groupId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  bayId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  mentorId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  @Matches(/Z$/u)
  startsAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  @Matches(/Z$/u)
  endsAt?: string;
}

export class TrainingSessionListQuery extends PaginationQuery {
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
  courseId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  bayId?: string;

  @IsOptional()
  @IsUUID()
  mentorId?: string;

  @IsOptional()
  @IsEnum(TrainingSessionStatus)
  status?: TrainingSessionStatus;
}

export class ConflictOverrideRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  conflictKeys!: string[];

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export enum SessionTransitionStatus {
  PUBLISHED = 'PUBLISHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class SessionTransitionDto {
  @IsEnum(SessionTransitionStatus)
  toStatus!: SessionTransitionStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
