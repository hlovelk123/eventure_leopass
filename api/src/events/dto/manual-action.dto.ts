import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ManualAttendanceActionDto {
  @IsString()
  @IsIn(['check_in', 'check_out'])
  action!: 'check_in' | 'check_out';

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  memberEmail?: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  scannerDeviceId?: string;
}
