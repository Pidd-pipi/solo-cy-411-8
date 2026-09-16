import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequireAuth } from '../middlewares/auth';
import { RoleGuard, Roles } from '../middlewares/roleCheck';
import { AuditLogService } from '../services/auditLogService';
import { logTemplate } from '../utils/logger';

@Controller('audit')
@UseGuards(RequireAuth, RoleGuard)
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles('admin')
  list() {
    logTemplate('info', 'AUDIT_WRITE_START', { entity: 'AuditLog', action: 'controller list' });
    return this.auditLogService.list();
  }
}
