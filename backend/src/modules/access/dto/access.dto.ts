import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum RoleCode {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  WORKSHOP_MANAGER = 'WORKSHOP_MANAGER',
  SERVICE_ADVISOR = 'SERVICE_ADVISOR',
  TECHNICIAN = 'TECHNICIAN',
  QUALITY_CHECKER = 'QUALITY_CHECKER',
  STOREKEEPER_PROCUREMENT = 'STOREKEEPER_PROCUREMENT',
  MENTOR = 'MENTOR',
  TRAINING_SUPERVISOR = 'TRAINING_SUPERVISOR',
  STUDENT = 'STUDENT',
  FINANCE_VIEWER_AUDITOR = 'FINANCE_VIEWER_AUDITOR',
}
export enum UserStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
export enum ScopeStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export enum Locale { EN = 'en', AR = 'ar' }
export enum ScopeType { BRANCH = 'BRANCH', STORE = 'STORE', TRAINING_PROGRAM = 'TRAINING_PROGRAM' }

export class UserListQuery {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(RoleCode) role?: RoleCode;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsUUID() organizationScopeId?: string;
}

export class ScopeListQuery {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsEnum(ScopeType) type?: ScopeType;
}

export class CreateUserDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @IsEnum(Locale) preferredLocale!: Locale;
  @IsString() @MinLength(12) @MaxLength(128) temporaryPassword!: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) displayName?: string;
  @IsOptional() @IsEnum(Locale) preferredLocale?: Locale;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(128) temporaryPassword?: string;

}

export class RoleAssignmentDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];
}

export class ScopeAssignmentDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(50) @IsUUID(undefined, { each: true })
  organizationScopeIds!: string[];
}

export class CreateScopeDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(ScopeType) type!: ScopeType;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateScopeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(ScopeStatus) status?: ScopeStatus;

}
