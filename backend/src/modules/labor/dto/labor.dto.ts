import { Type } from 'class-transformer';
import {
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
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum LaborEntryStatus {
  ACTIVE = 'ACTIVE',
  VOIDED = 'VOIDED',
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function AtLeastOneCorrectableField(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneCorrectableField',
      target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const object = args.object as Record<string, unknown>;
          return ['workDate', 'durationMinutes', 'description'].some((key) => object[key] !== undefined);
        },
        defaultMessage: () => 'At least one field to correct is required',
      },
    });
  };
}

export class LaborEntryCreateRequest {
  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  workDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

@AtLeastOneCorrectableField()
export class LaborEntryUpdateRequest {
  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  workDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeReason!: string;
}

export class VoidLaborEntryRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class LaborEntryListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(LaborEntryStatus)
  status?: LaborEntryStatus;
}
