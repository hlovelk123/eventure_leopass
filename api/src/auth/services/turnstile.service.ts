import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

@Injectable()
export class TurnstileService {
  private readonly verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('CF_TURNSTILE_SECRET_KEY');
    if (!secret) {
      throw new InternalServerErrorException('Turnstile secret key not configured');
    }
    this.secret = secret;
  }

  async verify(token: string, remoteIp?: string): Promise<void> {
    const body = new URLSearchParams({
      secret: this.secret,
      response: token
    });
    if (remoteIp) {
      body.append('remoteip', remoteIp);
    }

    const response = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      throw new InternalServerErrorException('Failed to verify Turnstile response');
    }

    const payload = (await response.json()) as TurnstileResponse;
    if (!payload.success) {
      throw new UnauthorizedException({
        message: 'Turnstile verification failed',
        codes: payload['error-codes'] ?? []
      });
    }
  }
}
