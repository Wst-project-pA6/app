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
