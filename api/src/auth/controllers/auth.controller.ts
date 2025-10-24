import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { TurnstileService } from '../services/turnstile.service.js';
import { SessionService } from '../services/session.service.js';
import { RequestOtpDto } from '../dto/request-otp.dto.js';
import { VerifyOtpDto } from '../dto/verify-otp.dto.js';
import { WebauthnRegisterVerifyDto } from '../dto/webauthn-register-verify.dto.js';
import { WebauthnLoginOptionsDto } from '../dto/webauthn-login-options.dto.js';
import { WebauthnLoginVerifyDto } from '../dto/webauthn-login-verify.dto.js';
import { UsersService } from '../../users/users.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly turnstileService: TurnstileService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService
  ) {}

  private sanitizeUser(user: { id: string; email: string; displayName: string; status: string }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status
    };
  }

  @Post('otp/request')
  async requestOtp(@Body() body: RequestOtpDto) {
    await this.turnstileService.verify(body.turnstileToken);
    const { challengeId, user } = await this.authService.requestOtp(body.email, body.turnstileToken);
    return { challengeId, expiresInMinutes: 10, user: this.sanitizeUser(user) };
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.verifyOtp({
      email: body.email,
      challengeId: body.challengeId,
      code: body.code,
      response: res
    });
    return { user: this.sanitizeUser(user) };
  }

  @Get('session')
  async getSession(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return { user: this.sanitizeUser(user) };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieHeader = req.headers.cookie as string | string[] | undefined;
    const cookieValue: string | undefined = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const parsed = cookieValue ? this.sessionService.parseCookie(cookieValue) : null;
    if (parsed) {
      await this.sessionService.invalidateSession(parsed.sessionId);
    }
    res.setHeader('Set-Cookie', this.sessionService.clearCookieHeader());
    return { success: true };
  }

  @Post('webauthn/register/options')
  async getRegistrationOptions(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    const { options, challengeId } = await this.authService.generatePasskeyRegistrationOptions(user);
    return { options, challengeId };
  }

  @Post('webauthn/register/verify')
  async verifyRegistration(@Req() req: Request, @Body() body: WebauthnRegisterVerifyDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    await this.authService.verifyPasskeyRegistration(user, body.credential, body.challengeId);
    return { success: true };
  }

  @Post('webauthn/login/options')
  async getLoginOptions(@Body() body: WebauthnLoginOptionsDto) {
    if (body.turnstileToken) {
      await this.turnstileService.verify(body.turnstileToken);
    }
    const { user, options, challengeId } = await this.authService.generatePasskeyAuthenticationOptions(body.email);
    return { options, challengeId, user: this.sanitizeUser(user) };
  }

  @Post('webauthn/login/verify')
  async verifyLogin(@Body() body: WebauthnLoginVerifyDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.usersService.findByEmail(body.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    await this.authService.verifyPasskeyAuthentication({
      user,
      response: body.credential,
      challengeId: body.challengeId,
      expressResponse: res
    });
    return { user: this.sanitizeUser(user) };
  }
}
