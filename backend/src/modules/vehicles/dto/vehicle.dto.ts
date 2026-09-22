import { Type } from 'class-transformer';
import {
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
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum MileageUnit {
  KM = 'KM',
  MI = 'MI',
}

export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ServiceReminderStatus {
  OPEN = 'OPEN',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum ServiceReminderUpdateStatus {
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
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

function AtLeastOneProperty(
  minLength: number,
  maxLength: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'atLeastOneProperty',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (!Object.values(args.object as object).some((item) => item !== undefined)) return false;
          return (
            value === undefined ||
            (typeof value === 'string' && value.length >= minLength && value.length <= maxLength)
          );
        },
        defaultMessage(): string {
          return 'At least one property is required';
        },
      },
    });
  };
}

function HasReminderTrigger(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'hasReminderTrigger',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const reminder = args.object as { dueDate?: string; dueMileage?: number };
          return reminder.dueDate !== undefined || reminder.dueMileage !== undefined;
        },
        defaultMessage(): string {
          return 'At least one of dueDate or dueMileage is required';
        },
      },
    });
  };
}

export class CreateVehicleDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  plate!: string;

  @IsString()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/)
  vin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  make!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  model!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage!: number;

  @IsEnum(MileageUnit)
  mileageUnit!: MileageUnit;
}

export class UpdateVehicleDto {
  @AtLeastOneProperty(2, 20)
  plate: string | undefined = undefined;

  @Type(() => Number)
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  mileage?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}

export class VehicleListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(17)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}

export class ServiceHistoryQuery extends PaginationQuery {}

export class ServiceReminderListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(ServiceReminderStatus)
  status?: ServiceReminderStatus;
}

export class CreateServiceReminderDto {
  @HasReminderTrigger()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateOnly()
  dueDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dueMileage?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateServiceReminderDto {
  @AtLeastOneProperty(1, 160)
  title: string | undefined = undefined;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateOnly()
  dueDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dueMileage?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ServiceReminderUpdateStatus)
  status?: ServiceReminderUpdateStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
