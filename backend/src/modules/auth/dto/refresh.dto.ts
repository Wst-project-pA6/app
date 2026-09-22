import { IsString, Length } from 'class-validator';

export class RefreshRequest {
  @IsString()
  @Length(20, 512)
  refreshToken!: string;
}
