import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum TrainingTermStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

function IsDateOnly(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const [year, month, day] = value.split('-').map(Number);
          const date = new Date(Date.UTC(year, month - 1, day));
          return (
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
          );
        },
        defaultMessage(): string {
          return 'Value must be a valid date in YYYY-MM-DD format';
        },
      },
    });
  };
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneTrainingTermProperty',
      target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          return Object.values(args.object as object).some((item) => item !== undefined);
        },
        defaultMessage: () => 'At least one property is required',
      },
    });
  };
}

export class CreateTrainingTermDto {
  @IsUUID()
  organizationScopeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsDateOnly()
  startDate!: string;

  @IsDateOnly()
  endDate!: string;
}

@AtLeastOneProperty()
export class UpdateTrainingTermDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateOnly()
  startDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateOnly()
  endDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TrainingTermStatus)
  status?: TrainingTermStatus;
}

export class TrainingTermListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(TrainingTermStatus)
  status?: TrainingTermStatus;
}
