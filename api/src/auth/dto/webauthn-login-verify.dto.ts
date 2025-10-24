import { IsEmail, IsObject, IsString } from 'class-validator';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';

export class WebauthnLoginVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  challengeId!: string;

  @IsObject()
  credential!: AuthenticationResponseJSON;
}
