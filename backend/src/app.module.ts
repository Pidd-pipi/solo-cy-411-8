import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database';
import { AppController } from './app.controller';
import { activityRouteControllers } from './routes/activities';
import { auditRouteControllers } from './routes/audit';
import { factorRouteControllers } from './routes/factors';
import { goalRouteControllers } from './routes/goals';
import { rankingRouteControllers } from './routes/ranking';
import { userRouteControllers } from './routes/users';
import { Activity } from './models/activity';
import { AuditLog } from './models/auditLog';
import { CarbonFactor } from './models/carbonFactor';
import { Goal } from './models/goal';
import { Role } from './models/role';
import { User } from './models/user';
import { AuditLogger } from './middlewares/auditLogger';
import { ErrorHandler } from './middlewares/errorHandler';
import { ActivityService } from './services/activityService';
import { AuditLogService } from './services/auditLogService';
import { FactorService } from './services/factorService';
import { GoalService } from './services/goalService';
import { RankingService } from './services/rankingService';
import { UserService } from './services/userService';

@Module({
  imports: [TypeOrmModule.forRoot(databaseConfig()), TypeOrmModule.forFeature([User, Role, Activity, Goal, CarbonFactor, AuditLog])],
  controllers: [
    AppController,
    ...userRouteControllers,
    ...activityRouteControllers,
    ...goalRouteControllers,
    ...factorRouteControllers,
    ...auditRouteControllers,
    ...rankingRouteControllers
  ],
  providers: [
    UserService,
    ActivityService,
    GoalService,
    FactorService,
    AuditLogService,
    RankingService,
    { provide: APP_INTERCEPTOR, useClass: AuditLogger },
    { provide: APP_FILTER, useClass: ErrorHandler }
  ]
})
export class AppModule {}
