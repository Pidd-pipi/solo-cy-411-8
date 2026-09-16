import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { AppError } from '../utils/AppError';
import { verifyCarbonToken } from '../utils/jwt';
import { logTemplate } from '../utils/logger';

@Injectable()
export class RequireAuth implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      logTemplate('warn', 'AUTH_GUARD_DENIED', { token: '-', reason: 'missing bearer token' });
      throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING, 'Auth[token=missing] access failed: authorization header missing', HttpStatus.UNAUTHORIZED);
    }
    try {
      const payload = verifyCarbonToken(header.slice(7));
      request.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        region: payload.region,
        roles: payload.roles || []
      };
      logTemplate('info', 'AUTH_GUARD_GRANTED', { id: payload.sub });
      return true;
    } catch {
      throw new AppError(ErrorCodes.AUTH_TOKEN_INVALID, 'Auth[token=provided] access failed: token invalid', HttpStatus.UNAUTHORIZED);
    }
  }
}

