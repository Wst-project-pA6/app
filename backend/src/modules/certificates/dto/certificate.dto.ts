import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum CertificateStatus {
  ISSUED = 'ISSUED',
  REVOKED = 'REVOKED',
}

export class CertificateIssueDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  courseId!: string;
}

export class RevokeCertificateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CertificateListQuery extends PaginationQuery {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(CertificateStatus)
  status?: CertificateStatus;
}
