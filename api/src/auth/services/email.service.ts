import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey?: string;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ZEPTO_API_KEY');
    const appName = this.configService.get<string>('APP_NAME') ?? 'Leo Pass';
    this.fromAddress = 'no-reply@eventurelk.com';
    this.fromName = appName;
  }

  async sendOtpEmail(recipient: string, code: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`OTP for ${recipient}: ${code}`);
      return;
    }

    const payload = {
      from: {
        address: this.fromAddress,
        name: this.fromName
      },
      to: [
        {
          email_address: {
            address: recipient
          }
        }
      ],
      subject: 'Your Leo Pass verification code',
      htmlbody: `<p>Your one-time verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      textbody: `Your one-time verification code is ${code}. It expires in 10 minutes.`
    };

    const response = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      this.logger.error(`Failed to send OTP email via ZeptoMail: ${response.statusText}`);
    }
  }
}
