import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum TrainingGroupStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneTrainingGroupProperty',
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

export class CreateTrainingGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsUUID()
  courseId!: string;
}

@AtLeastOneProperty()
export class UpdateTrainingGroupDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TrainingGroupStatus)
  status?: TrainingGroupStatus;
}

export class TrainingGroupListQuery extends PaginationQuery {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(TrainingGroupStatus)
  status?: TrainingGroupStatus;
}
