import { UserController } from '../controllers/userController';
import { logTemplate } from '../utils/logger';

export const userRoutes = [
  'POST /users/register',
  'POST /users/login',
  'GET /users/me requireAuth',
  'PATCH /users/me requireAuth audit'
];

logTemplate('info', 'USER_LOGIN_START', { email: 'routes/users.ts loaded' });
export const userRouteControllers = [UserController];

