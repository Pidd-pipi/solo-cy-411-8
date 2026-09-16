import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes } from '../constants/errorCodes';
import { AuditLog } from '../models/auditLog';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

export interface AuditPayload {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  detail: string;
  ip?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  async write(payload: AuditPayload) {
    logTemplate('info', 'AUDIT_WRITE_START', { entity: payload.entity, action: payload.action });
    try {
      const row = this.auditRepo.create({
        userId: payload.userId ?? null,
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId ?? null,
        detail: payload.detail,
        ip: payload.ip ?? null
      });
      const saved = await this.auditRepo.save(row);
      logTemplate('info', 'AUDIT_WRITE_SUCCESS', { id: saved.id, entity: payload.entity });
      return saved;
    } catch (error) {
      logTemplate('error', 'AUDIT_WRITE_FAILED', { entity: payload.entity, reason: String(error) });
      throw new AppError(ErrorCodes.AUDIT_LOG_FAILED, `AuditLog[entity=${payload.entity}] write failed: detail ${payload.detail}`);
    }
  }

  async list() {
    logTemplate('info', 'AUDIT_WRITE_START', { entity: 'AuditLog', action: 'list' });
    return this.auditRepo.find({ order: { createdAt: 'DESC' }, take: 100 });
  }
}

