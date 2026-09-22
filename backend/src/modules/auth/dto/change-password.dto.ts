import { IsString, Length, MaxLength } from 'class-validator';

export class ChangePasswordRequest {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
