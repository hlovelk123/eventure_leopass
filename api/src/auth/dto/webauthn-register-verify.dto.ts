import { IsObject, IsString } from 'class-validator';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';

export class WebauthnRegisterVerifyDto {
  @IsString()
  challengeId!: string;

  @IsObject()
  credential!: RegistrationResponseJSON;
}
