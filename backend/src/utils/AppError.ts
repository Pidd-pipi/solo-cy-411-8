import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/errorCodes';

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST
  ) {
    super({ code, message }, status);
  }
}

