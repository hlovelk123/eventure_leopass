import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  turnstileToken!: string;
}
