import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum PartStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export function IsYearRangeValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isYearRangeValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as { yearFrom?: number; yearTo?: number };
          if (obj.yearFrom !== undefined && obj.yearTo !== undefined) {
            return obj.yearFrom <= obj.yearTo;
          }
          return true;
        },
        defaultMessage: () => 'yearTo must be greater than or equal to yearFrom',
      },
    });
  };
}

export class LocalizedNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  en!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ar?: string;
}

export class MoneyDto {
  @IsString()
  @Matches(/^-?[0-9]{1,12}(\.[0-9]{1,4})?$/)
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class VehicleCompatibilityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  make!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  model?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  yearFrom?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  @IsYearRangeValid()
  yearTo?: number;
}

export class CreatePartDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{1,63}$/)
  sku!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[0-9A-Za-z-]{4,64}$/)
  barcode?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name!: LocalizedNameDto;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitOfMeasure!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  sellingPrice!: MoneyDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VehicleCompatibilityDto)
  compatibility?: VehicleCompatibilityDto[];
}

function AtLeastOnePartProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOnePartProperty',
      target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          return Object.entries(args.object as object).some(
            ([key, item]) => key !== 'version' && item !== undefined,
          );
        },
        defaultMessage: () => 'At least one property is required',
      },
    });
  };
}

@AtLeastOnePartProperty()
export class UpdatePartDto {
  @IsInt()
  @Min(1)
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[0-9A-Za-z-]{4,64}$/)
  barcode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name?: LocalizedNameDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  sellingPrice?: MoneyDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VehicleCompatibilityDto)
  compatibility?: VehicleCompatibilityDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PartStatus)
  status?: PartStatus;
}

export class PartListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  compatibleMake?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  compatibleModel?: string;

  @IsOptional()
  @IsEnum(PartStatus)
  status?: PartStatus;
}
