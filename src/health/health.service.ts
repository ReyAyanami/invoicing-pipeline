import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      service: 'invoicing-pipeline',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
