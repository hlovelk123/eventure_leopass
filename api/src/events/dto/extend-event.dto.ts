import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class ExtendEventDto {
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(180)
  minutes!: number;

  @IsString()
  @MinLength(5)
  reason!: string;
}
