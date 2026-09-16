import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { RequireAuth } from '../middlewares/auth';
import { GoalInput, GoalService } from '../services/goalService';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

@Controller('goals')
@UseGuards(RequireAuth)
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Get()
  list(@Req() request: Request) {
    return this.goalService.list(request.user!.id);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: GoalInput) {
    request.auditEntity = 'Goal';
    request.auditAction = 'Goal create';
    try {
      return await this.goalService.create(request.user!.id, body);
    } catch (error: any) {
      logTemplate('error', 'GOAL_CREATE_FAILED', { id: 0, field: 'Goal.status', reason: error.message });
      throw new AppError(error.code || ErrorCodes.GOAL_STATUS_INVALID, `Goal[id=0] controller create failed: status ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: Partial<GoalInput>) {
    request.auditEntity = 'Goal';
    request.auditEntityId = Number(id);
    request.auditAction = 'Goal update';
    try {
      return await this.goalService.update(request.user!.id, Number(id), body);
    } catch (error: any) {
      throw new AppError(error.code || ErrorCodes.DATABASE_FAILED, `Goal[id=${id}] controller update failed: id ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }
}

