import { FactorController } from '../controllers/factorController';
import { ActivityCategory } from '../constants/activity';
import { logTemplate } from '../utils/logger';

export const factorRoutes = [
  'GET /factors requireAuth',
  'POST /factors requireAuth requireRole=admin audit'
];

logTemplate('info', 'FACTOR_LIST_START', { values: Object.values(ActivityCategory).join(',') });
export const factorRouteControllers = [FactorController];

