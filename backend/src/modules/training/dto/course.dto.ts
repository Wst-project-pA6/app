import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export enum CourseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
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

export class CourseTaskDto {
  @IsUUID()
  taskId!: string;

  @IsBoolean()
  required!: boolean;
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneCourseProperty',
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

export class CreateCourseDto {
  @IsUUID()
  organizationScopeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name!: LocalizedNameDto;

  @IsUUID()
  termId!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CourseTaskDto)
  tasks!: CourseTaskDto[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minimumAttendancePercent!: number;
}

@AtLeastOneProperty()
export class UpdateCourseDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name?: LocalizedNameDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CourseTaskDto)
  tasks?: CourseTaskDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minimumAttendancePercent?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}

export class CourseListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
