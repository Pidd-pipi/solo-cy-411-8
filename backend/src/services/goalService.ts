import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Repository } from 'typeorm';
import { ErrorCodes } from '../constants/errorCodes';
import { GoalStatus } from '../constants/goal';
import { Messages } from '../constants/messages';
import { Goal } from '../models/goal';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';
import { ActivityService } from './activityService';

export interface GoalInput {
  title: string;
  targetValue: number;
  periodType: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
}

@Injectable()
export class GoalService {
  constructor(
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
    private readonly activityService: ActivityService
  ) {}

  async list(userId: number) {
    logTemplate('info', 'GOAL_LIST_START');
    const goals = await this.goalRepo.find({ where: { userId }, order: { endDate: 'ASC' } });
    return Promise.all(goals.map((goal) => this.attachProgress(userId, goal)));
  }

  async create(userId: number, input: GoalInput) {
    logTemplate('info', 'GOAL_CREATE_START', { userId, status: input.status });
    if (!Object.values(GoalStatus).includes(input.status)) {
      logTemplate('warn', 'GOAL_CREATE_FAILED', { id: 0, field: 'Goal.status', reason: 'invalid enum' });
      throw new AppError(ErrorCodes.GOAL_STATUS_INVALID, `Goal[id=0] create failed: status invalid`);
    }
    const goal = this.goalRepo.create({
      userId,
      title: input.title,
      targetValue: String(input.targetValue),
      periodType: input.periodType,
      startDate: dayjs(input.startDate).format('YYYY-MM-DD'),
      endDate: dayjs(input.endDate).format('YYYY-MM-DD'),
      status: input.status
    });
    const saved = await this.goalRepo.save(goal);
    logTemplate('info', 'GOAL_CREATE_SUCCESS', { id: saved.id, targetValue: saved.targetValue });
    return { message: Messages.GOAL_CREATED, goal: await this.attachProgress(userId, saved) };
  }

  async update(userId: number, id: number, input: Partial<GoalInput>) {
    const goal = await this.goalRepo.findOne({ where: { userId, id } });
    if (!goal) {
      throw new AppError(ErrorCodes.GOAL_NOT_FOUND, `Goal[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
    }
    goal.title = input.title ?? goal.title;
    goal.targetValue = input.targetValue ? String(input.targetValue) : goal.targetValue;
    goal.periodType = input.periodType ?? goal.periodType;
    goal.startDate = input.startDate ? dayjs(input.startDate).format('YYYY-MM-DD') : goal.startDate;
    goal.endDate = input.endDate ? dayjs(input.endDate).format('YYYY-MM-DD') : goal.endDate;
    goal.status = input.status ?? goal.status;
    if (!Object.values(GoalStatus).includes(goal.status)) {
      throw new AppError(ErrorCodes.GOAL_STATUS_INVALID, `Goal[id=${id}] update failed: status invalid`);
    }
    const saved = await this.goalRepo.save(goal);
    return { message: Messages.GOAL_UPDATED, goal: await this.attachProgress(userId, saved) };
  }

  private async attachProgress(userId: number, goal: Goal) {
    const summary = await this.activityService.summarize(userId, goal.startDate, goal.endDate);
    const currentValue = summary.total;
    const targetValue = Number(goal.targetValue);
    const progress = targetValue === 0 ? 0 : Math.min(100, Number(((currentValue / targetValue) * 100).toFixed(1)));
    logTemplate('info', 'GOAL_PROGRESS_CALCULATED', { id: goal.id, currentValue, targetValue });
    return { ...goal, currentValue, progress };
  }
}

