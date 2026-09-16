import { Controller, Get } from '@nestjs/common';
import { appConfig } from './config/app';
import { logTemplate } from './utils/logger';

@Controller()
export class AppController {
  @Get('health')
  health() {
    logTemplate('info', 'HEALTH_CHECK');
    return {
      status: 'ok',
      service: 'carbontrack-backend',
      project: appConfig.composeProjectName,
      time: new Date().toISOString()
    };
  }
}

