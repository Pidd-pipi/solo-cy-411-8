import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { logTemplate } from '../utils/logger';

@Catch()
export class ErrorHandler implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : { code: ErrorCodes.DATABASE_FAILED, message: String(exception) };
    const message = typeof payload === 'string' ? payload : (payload as any).message;
    const code = typeof payload === 'string' ? ErrorCodes.DATABASE_FAILED : (payload as any).code || ErrorCodes.DATABASE_FAILED;
    logTemplate('error', 'ACTIVITY_CREATE_FAILED', { id: 0, field: 'GlobalErrorHandler', reason: message });
    response.status(status).json({
      code,
      message,
      timestamp: new Date().toISOString()
    });
  }
}

