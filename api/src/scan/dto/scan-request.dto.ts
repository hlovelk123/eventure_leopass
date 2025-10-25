import { IsOptional, IsString, IsISO8601 } from 'class-validator';

export class ScanRequestDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  scannerDeviceId?: string;

  @IsOptional()
  @IsISO8601()
  scannedAt?: string;
}
