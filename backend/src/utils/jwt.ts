import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../config/app';
import { JwtPayload } from '../types/auth';
import { logTemplate } from './logger';

const jwtService = new JwtService({ secret: process.env.JWT_SECRET || appConfig.jwtSecret });

export function signCarbonToken(payload: JwtPayload) {
  logTemplate('info', 'AUTH_GUARD_GRANTED', { id: payload.sub });
  return jwtService.sign(payload, { expiresIn: '2h' });
}

export function verifyCarbonToken(token: string): JwtPayload {
  try {
    return jwtService.verify<JwtPayload>(token, { secret: process.env.JWT_SECRET || appConfig.jwtSecret });
  } catch (error) {
    logTemplate('warn', 'AUTH_GUARD_DENIED', { token: token.slice(0, 8), reason: 'jwt verify failed' });
    throw error;
  }
}

