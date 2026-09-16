import { AuditController } from '../controllers/auditController';
import { logTemplate } from '../utils/logger';

export const auditRoutes = ['GET /audit requireAuth requireRole=admin'];

logTemplate('info', 'AUDIT_WRITE_START', { entity: 'AuditLog', action: 'routes/audit.ts loaded' });
export const auditRouteControllers = [AuditController];

