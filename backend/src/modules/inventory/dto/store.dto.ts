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

export enum StoreStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

function AtLeastOneStoreProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneStoreProperty',
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

export class CreateStoreDto {
  @IsUUID()
  organizationScopeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

@AtLeastOneStoreProperty()
export class UpdateStoreDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(StoreStatus)
  status?: StoreStatus;
}

export class StoreListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;
}
