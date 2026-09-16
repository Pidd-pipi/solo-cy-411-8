import { AuditLog } from '../types/entities';
import { request } from '../utils/request';

export function fetchAuditLogs(): Promise<AuditLog[]> {
  return request.get('/audit');
}

