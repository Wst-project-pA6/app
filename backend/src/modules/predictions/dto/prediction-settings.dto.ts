import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class PredictionSettingsUpdateDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsInt()
  @Min(1)
  @Max(52)
  reorderLookbackWeeks!: number;

  @IsBoolean()
  mlServiceEnabled!: boolean;
}

export interface PredictionSettingsResponse {
  version: number;
  reorderLookbackWeeks: number;
  mlServiceEnabled: boolean;
  baselineVersion: string;
}
