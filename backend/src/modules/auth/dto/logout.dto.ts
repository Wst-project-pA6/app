import { IsString, Length } from 'class-validator';

export class LogoutRequest {
  @IsString()
  @Length(20, 512)
  refreshToken!: string;
}
