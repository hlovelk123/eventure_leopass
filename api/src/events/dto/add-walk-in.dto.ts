import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AddWalkInDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  scannerDeviceId?: string;
}
