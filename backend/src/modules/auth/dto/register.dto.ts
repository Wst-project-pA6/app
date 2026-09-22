import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum RegisterLocale {
  EN = 'en',
  AR = 'ar',
}

export class RegisterRequest {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsEnum(RegisterLocale)
  preferredLocale!: RegisterLocale;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
