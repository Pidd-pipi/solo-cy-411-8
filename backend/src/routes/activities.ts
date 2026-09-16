import { ActivityController } from '../controllers/activityController';
import { ActivityCategory } from '../constants/activity';
import { logTemplate } from '../utils/logger';

export const activityRoutes = [
  'GET /activities requireAuth filters=category,start,end',
  'GET /activities/summary requireAuth',
  'POST /activities requireAuth audit',
  'PATCH /activities/:id requireAuth audit',
  'DELETE /activities/:id requireAuth audit'
];

logTemplate('info', 'ACTIVITY_LIST_START', { values: Object.values(ActivityCategory).join(',') });
export const activityRouteControllers = [ActivityController];

