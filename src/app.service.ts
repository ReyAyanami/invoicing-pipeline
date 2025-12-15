import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): Record<string, any> {
    return {
      status: 'ok',
      service: 'invoicing-pipeline',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
