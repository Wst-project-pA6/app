import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
  COMPLETED = 'COMPLETED',
}

export enum EnrollmentUpdateStatus {
  WITHDRAWN = 'WITHDRAWN',
}

export class CreateEnrollmentDto {
  @IsUUID()
  studentId!: string;
}

export class UpdateEnrollmentDto {
  @IsEnum(EnrollmentUpdateStatus)
  status!: EnrollmentUpdateStatus;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class EnrollmentListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
