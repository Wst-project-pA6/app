import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
import { LocalizedNameDto } from './course.dto';

export enum PracticalTaskStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOnePracticalTaskProperty',
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

export class CreatePracticalTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  title!: LocalizedNameDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsUUID()
  competencyId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  expectedMinutes!: number;
}

@AtLeastOneProperty()
export class UpdatePracticalTaskDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  title?: LocalizedNameDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  competencyId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  expectedMinutes?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PracticalTaskStatus)
  status?: PracticalTaskStatus;
}

export class PracticalTaskListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  competencyId?: string;

  @IsOptional()
  @IsEnum(PracticalTaskStatus)
  status?: PracticalTaskStatus;
}
