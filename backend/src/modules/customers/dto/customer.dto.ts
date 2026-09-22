import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum CustomerType {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum PreferredChannel {
  PHONE = 'PHONE',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

export enum CustomerLocale {
  EN = 'en',
  AR = 'ar',
}

export class ContactPreferencesDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PreferredChannel)
  preferredChannel?: PreferredChannel;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CustomerLocale)
  preferredLocale?: CustomerLocale;
}

function AtLeastOneProperty(validationOptions?: ValidationOptions) {
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
            (typeof value === 'string' && value.length >= 1 && value.length <= 160)
          );
        },
        defaultMessage(): string {
          return 'At least one property is required';
        },
      },
    });
  };
}

export class CreateCustomerDto {
  @IsUUID()
  organizationScopeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @IsEnum(CustomerType)
  type!: CustomerType;

  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/)
  phone!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ContactPreferencesDto)
  contactPreferences?: ContactPreferencesDto;
}

export class UpdateCustomerDto {
  @AtLeastOneProperty()
  displayName: string | undefined = undefined;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ContactPreferencesDto)
  contactPreferences?: ContactPreferencesDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}

export class CustomerListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
