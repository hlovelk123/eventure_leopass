import { IsEmail, IsOptional, IsString } from 'class-validator';

export class WebauthnLoginOptionsDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
