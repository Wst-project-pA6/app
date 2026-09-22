import { IsString, Matches } from 'class-validator';

/**
 * Request-side Money shape matching the OpenAPI Money schema exactly.
 * amount is a decimal string (never a JSON number) to avoid floating-point corruption.
 */
export class MoneyDto {
  @IsString()
  @Matches(/^-?[0-9]{1,12}(\.[0-9]{1,4})?$/)
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
