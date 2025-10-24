import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
