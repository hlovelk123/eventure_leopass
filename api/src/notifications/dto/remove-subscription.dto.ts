import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
