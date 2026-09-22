import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum JobStage {
  RECEIVED = 'RECEIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  QUALITY_CHECK = 'QUALITY_CHECK',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
}

export enum JobPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum ServiceType {
  MAINTENANCE = 'MAINTENANCE',
  REPAIR = 'REPAIR',
  DIAGNOSTIC = 'DIAGNOSTIC',
  INSPECTION = 'INSPECTION',
  OTHER = 'OTHER',
}

export enum WorkItemStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

function AtLeastOneProperty(validationOptions?: ValidationOptions): ClassDecorator {
  return function (target: Function): void {
    registerDecorator({
      name: 'atLeastOneJobProperty',
      target,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          return Object.entries(args.object as object).some(([key, item]) => key !== 'version' && item !== undefined) || value !== undefined;
        },
        defaultMessage: () => 'At least one property is required',
      },
    });
  };
}

export class WorkItemCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsBoolean()
  isAdditionalWork?: boolean;
}

export class CreateJobCardDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  complaint!: string;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsEnum(JobPriority)
  priority!: JobPriority;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileageAtIntake!: number;

  @IsDateString()
  @Matches(/Z$/u)
  expectedCompletionAt!: string;

  @IsOptional()
  @IsArray()
  @Type(() => WorkItemCreateDto)
  @ValidateNested({ each: true })
  @ArrayMaxSize(50)
  workItems?: WorkItemCreateDto[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(10)
  attachmentIds?: string[];
}

@AtLeastOneProperty()
export class UpdateJobCardDto {
  @IsInt()
  @Min(1)
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  complaint?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  @Matches(/Z$/u)
  expectedCompletionAt?: string;
}

export class JobAssignmentDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsUUID()
  bayId!: string;

  @IsUUID()
  technicianId!: string;

  @IsDateString()
  @Matches(/Z$/u)
  scheduledStartAt!: string;

  @IsDateString()
  @Matches(/Z$/u)
  expectedCompletionAt!: string;
}

export class JobListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  from?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/Z$/u)
  to?: string;

  @IsOptional()
  @IsEnum(JobStage)
  stage?: JobStage;

  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  jobNumber?: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsUUID()
  bayId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class TechnicianListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;
}

export class WorkItemListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;
}

export class CreateWorkItemDto extends WorkItemCreateDto {}

@AtLeastOneProperty()
export class UpdateWorkItemDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;
}

export class JobTransitionRequest {
  @IsEnum(JobStage)
  toStage!: JobStage;

  @IsEnum(JobStage)
  expectedFromStage!: JobStage;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class JobStageHistoryQuery extends PaginationQuery {}
