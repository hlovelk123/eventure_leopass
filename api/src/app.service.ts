import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): Record<string, string> {
    return { status: 'ok' };
  }
}
