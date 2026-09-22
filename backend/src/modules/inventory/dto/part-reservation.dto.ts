import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum PartReservationStatus {
  ACTIVE = 'ACTIVE',
  FULFILLED = 'FULFILLED',
  RELEASED = 'RELEASED',
}

export class PartReservationCreateRequest {
  @IsUUID()
  partId!: string;

  @IsUUID()
  storeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;
}

export class PartReservationListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(PartReservationStatus)
  status?: PartReservationStatus;
}
