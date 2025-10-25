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
    await this.sendEmail({
      to: recipient,
      subject: 'Your Leo Pass verification code',
      html: `<p>Your one-time verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      text: `Your one-time verification code is ${code}. It expires in 10 minutes.`
    });
  }

  async sendNotificationEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    const text = params.text ?? this.toPlainText(params.html);
    await this.sendEmail({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text
    });
  }

  private async sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`Email stub => ${params.to}: ${params.subject}`);
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
            address: params.to
          }
        }
      ],
      subject: params.subject,
      htmlbody: params.html,
      textbody: params.text
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
      this.logger.error(`Failed to send email via ZeptoMail: ${response.statusText}`);
    }
  }

  private toPlainText(html: string): string {
    return html
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
