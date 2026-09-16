import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata, Type, mixin } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

export const ROLES_KEY = 'carbontrack_roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) || [];
    const request = context.switchToHttp().getRequest<Request>();
    if (!required.length) return true;
    const roles = request.user?.roles || [];
    const ok = required.some((role) => roles.includes(role));
    if (!ok) {
      logTemplate('warn', 'RBAC_DENIED', { id: request.user?.id || 0, roles: required.join(',') });
      throw new AppError(ErrorCodes.RBAC_ROLE_DENIED, `RBAC[user_id=${request.user?.id || 0}] access failed: roles ${required.join(',')} required`, HttpStatus.FORBIDDEN);
    }
    logTemplate('info', 'RBAC_GRANTED', { id: request.user?.id || 0, roles: required.join(',') });
    return true;
  }
}

export function requireRole(...roles: string[]): Type<CanActivate> {
  class RoleCheckMixin extends RoleGuard {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const ok = roles.some((role) => request.user?.roles.includes(role));
      if (!ok) {
        logTemplate('warn', 'RBAC_DENIED', { id: request.user?.id || 0, roles: roles.join(',') });
        throw new AppError(ErrorCodes.RBAC_ROLE_DENIED, `RBAC[user_id=${request.user?.id || 0}] access failed: roles ${roles.join(',')} required`, HttpStatus.FORBIDDEN);
      }
      return true;
    }
  }
  return mixin(RoleCheckMixin);
}

