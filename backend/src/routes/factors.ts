import { FactorController } from '../controllers/factorController';
import { ActivityCategory } from '../constants/activity';
import { logTemplate } from '../utils/logger';

export const factorRoutes = [
  'GET /factors requireAuth filters=category,region,includeInactive',
  'POST /factors requireAuth requireRole=admin audit (publish versioned factor with effective_date)',
  'PATCH /factors/:id requireAuth requireRole=admin audit (amend not-yet-effective version)',
  'PATCH /factors/:id/status requireAuth requireRole=admin audit (deactivate/reactivate version)'
];

logTemplate('info', 'FACTOR_LIST_START', { values: Object.values(ActivityCategory).join(',') });
export const factorRouteControllers = [FactorController];
