import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsDate()
  @Type(() => Date)
  startTime!: Date;

  @IsDate()
  @Type(() => Date)
  endTime!: Date;

  @IsOptional()
  @IsUUID()
  hostClubId?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  geofenceRadiusM?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  reminderBeforeEndMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  autoCheckoutGraceMin?: number;

  @IsOptional()
  @IsBoolean()
  allowWalkIns?: boolean;

  @IsOptional()
  @IsBoolean()
  rsvpRequired?: boolean;
}
