import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export class MentorListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;
}
