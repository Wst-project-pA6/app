import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export class VendorCreateDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/, {
    message: 'phone must be in E.164 international format',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class VendorUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/, {
    message: 'phone must be in E.164 international format',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class VendorListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface VendorResponse {
  id: string;
  code: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface VendorPageResponse {
  items: VendorResponse[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
