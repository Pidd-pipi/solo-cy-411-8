import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../services/auditLogService';
import { logTemplate } from '../utils/logger';

@Injectable()
export class AuditLogger implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap((response: any) => {
        const method = request.method.toUpperCase();
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
        const entity = request.auditEntity || response?.activity?.constructor?.name || response?.goal?.constructor?.name || 'RouteMutation';
        const entityId = request.auditEntityId || response?.activity?.id || response?.goal?.id || response?.factor?.id || null;
        const action = request.auditAction || `${method} ${request.path}`;
        logTemplate('info', 'AUDIT_WRITE_START', { entity, action });
        void this.auditLogService.write({
          userId: request.user?.id ?? null,
          action,
          entity,
          entityId: entityId ? Number(entityId) : null,
          detail: `${entity}[id=${entityId || 0}] ${action} audit: ${JSON.stringify(request.body || {})}`,
          ip: request.ip
        });
      })
    );
  }
}

