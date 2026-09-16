import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { RequireAuth } from '../middlewares/auth';
import { ActivityInput, ActivityService } from '../services/activityService';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

@Controller('activities')
@UseGuards(RequireAuth)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  list(@Req() request: Request, @Query('category') category?: ActivityCategory, @Query('start') start?: string, @Query('end') end?: string) {
    return this.activityService.list(request.user!.id, category, start, end);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: ActivityInput) {
    request.auditEntity = 'Activity';
    request.auditAction = 'Activity create';
    try {
      return await this.activityService.create(request.user!.id, body);
    } catch (error: any) {
      logTemplate('error', 'ACTIVITY_CREATE_FAILED', { id: 0, field: 'Activity.category', reason: error.message });
      throw new AppError(error.code || ErrorCodes.VALIDATION_FAILED, `Activity[id=0] controller create failed: category ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: Partial<ActivityInput>) {
    request.auditEntity = 'Activity';
    request.auditEntityId = Number(id);
    request.auditAction = 'Activity update';
    try {
      return await this.activityService.update(request.user!.id, Number(id), body);
    } catch (error: any) {
      logTemplate('error', 'ACTIVITY_UPDATE_FAILED', { id, field: 'Activity.id', reason: error.message });
      throw new AppError(error.code || ErrorCodes.DATABASE_FAILED, `Activity[id=${id}] controller update failed: id ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    request.auditEntity = 'Activity';
    request.auditEntityId = Number(id);
    request.auditAction = 'Activity delete';
    return this.activityService.remove(request.user!.id, Number(id));
  }

  @Get('summary')
  summarize(@Req() request: Request, @Query('start') start: string, @Query('end') end: string) {
    return this.activityService.summarize(request.user!.id, start, end);
  }
}

