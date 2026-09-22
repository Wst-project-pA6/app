import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum BayStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  INACTIVE = 'INACTIVE',
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneBayProperty',
      target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          return Object.values(args.object as object).some((item) => item !== undefined) &&
            (value === undefined || typeof value === 'string' || typeof value === 'number' || Object.values(BayStatus).includes(value as BayStatus));
        },
        defaultMessage: () => 'At least one property is required',
      },
    });
  };
}

export class CreateBayDto {
  @IsUUID()
  organizationScopeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity!: number;
}

@AtLeastOneProperty()
export class UpdateBayDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(80)
  name: string | undefined = undefined;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(BayStatus)
  status?: BayStatus;
}

export class BayListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(BayStatus)
  status?: BayStatus;
}

export class BayCalendarQuery {
  @IsDateString()
  @Matches(/Z$/u)
  from!: string;

  @IsDateString()
  @Matches(/Z$/u)
  to!: string;
}
