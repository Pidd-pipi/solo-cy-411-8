import { RankingController } from '../controllers/rankingController';
import { logTemplate } from '../utils/logger';

export const rankingRoutes = ['GET /ranking requireAuth filters=region,start,end'];

logTemplate('info', 'ACTIVITY_LIST_START');
export const rankingRouteControllers = [RankingController];

