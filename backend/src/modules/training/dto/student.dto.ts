import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneStudentProperty',
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

export class CreateStudentDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  studentNumber!: string;
}

@AtLeastOneProperty()
export class UpdateStudentDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  studentNumber?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}

export class StudentListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}
