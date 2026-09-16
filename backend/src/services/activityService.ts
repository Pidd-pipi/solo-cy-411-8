import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Between, Repository } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { Activity } from '../models/activity';
import { AppError } from '../utils/AppError';
import { calculateCarbonValue } from '../utils/carbonCalculator';
import { logTemplate } from '../utils/logger';
import { FactorService } from './factorService';
import { UserService } from './userService';

export interface ActivityInput {
  category: ActivityCategory;
  subType: string;
  amount: number;
  unit: string;
  recordDate: string;
  note?: string;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>,
    private readonly factorService: FactorService,
    private readonly userService: UserService
  ) {}

  async list(userId: number, category?: ActivityCategory, start?: string, end?: string) {
    logTemplate('info', 'ACTIVITY_LIST_START');
    return this.activityRepo.find({
      where: {
        userId,
        ...(category ? { category } : {}),
        ...(start && end ? { recordDate: Between(start, end) } : {})
      },
      relations: ['factor'],
      order: { recordDate: 'DESC', id: 'DESC' }
    });
  }

  async create(userId: number, input: ActivityInput) {
    logTemplate('info', 'ACTIVITY_CREATE_START', { userId, category: input.category, subType: input.subType });
    if (!Object.values(ActivityCategory).includes(input.category)) {
      logTemplate('warn', 'ACTIVITY_CREATE_FAILED', { id: 0, field: 'Activity.category', reason: 'invalid enum' });
      throw new AppError(ErrorCodes.ACTIVITY_CATEGORY_INVALID, `Activity[id=0] create failed: category invalid`);
    }
    const user = await this.userService.findById(userId);
    const recordDate = dayjs(input.recordDate).format('YYYY-MM-DD');
    // 按“活动日期”匹配当时生效的因子版本，而不是当前最新版本。
    const factor = await this.factorService.findEffectiveAt(input.category, input.subType, user.region, recordDate);
    const carbonValue = calculateCarbonValue({ category: input.category, amount: Number(input.amount), factorValue: Number(factor.factorValue) });
    const activity = this.activityRepo.create({
      userId,
      factorId: Number(factor.id),
      factorVersion: factor.version,
      factorValueSnapshot: factor.factorValue,
      factorEffectiveDate: factor.effectiveDate,
      category: input.category,
      subType: input.subType,
      amount: String(input.amount),
      unit: input.unit,
      carbonValue: String(carbonValue),
      recordDate,
      note: input.note || null
    });
    const saved = await this.activityRepo.save(activity);
    logTemplate('info', 'ACTIVITY_FACTOR_PINNED', { id: saved.id, factorId: factor.id, version: factor.version, effectiveDate: factor.effectiveDate });
    logTemplate('info', 'ACTIVITY_CREATE_SUCCESS', { id: saved.id, carbonValue });
    return { message: Messages.ACTIVITY_CREATED, activity: saved };
  }

  async update(userId: number, id: number, input: Partial<ActivityInput>) {
    logTemplate('info', 'ACTIVITY_UPDATE_START', { id, fields: Object.keys(input).join(',') });
    const activity = await this.activityRepo.findOne({ where: { id, userId } });
    if (!activity) {
      logTemplate('warn', 'ACTIVITY_UPDATE_FAILED', { id, field: 'Activity.id', reason: 'not found' });
      throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
    }

    const nextRecordDate = input.recordDate ? dayjs(input.recordDate).format('YYYY-MM-DD') : activity.recordDate;
    activity.category = input.category ?? activity.category;
    activity.subType = input.subType ?? activity.subType;
    activity.amount = input.amount !== undefined ? String(input.amount) : activity.amount;
    activity.unit = input.unit ?? activity.unit;
    activity.recordDate = nextRecordDate;
    activity.note = input.note ?? activity.note;

    // 仅当影响计算的字段变化时，才按活动日期重新匹配当时生效版本并重算。
    // 只改备注/单位，或因子版本被停用，都保留既有固化结果。
    const calcChanged = ['category', 'subType', 'amount', 'recordDate'].some((field) => input[field as keyof ActivityInput] !== undefined);
    if (calcChanged) {
      const user = await this.userService.findById(userId);
      const factor = await this.factorService.findEffectiveAt(activity.category, activity.subType, user.region, nextRecordDate);
      const carbonValue = calculateCarbonValue({ category: activity.category, amount: Number(activity.amount), factorValue: Number(factor.factorValue) });
      activity.factorId = Number(factor.id);
      activity.factorVersion = factor.version;
      activity.factorValueSnapshot = factor.factorValue;
      activity.factorEffectiveDate = factor.effectiveDate;
      activity.carbonValue = String(carbonValue);
      logTemplate('info', 'ACTIVITY_FACTOR_PINNED', { id, factorId: factor.id, version: factor.version, effectiveDate: factor.effectiveDate });
    }

    const saved = await this.activityRepo.save(activity);
    logTemplate('info', 'ACTIVITY_UPDATE_SUCCESS', { id: saved.id, carbonValue: saved.carbonValue });
    return { message: Messages.ACTIVITY_UPDATED, activity: saved };
  }

  async remove(userId: number, id: number) {
    const activity = await this.activityRepo.findOne({ where: { id, userId } });
    if (!activity) {
      throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
    }
    await this.activityRepo.remove(activity);
    logTemplate('info', 'ACTIVITY_DELETE_SUCCESS', { id });
    return { message: Messages.ACTIVITY_DELETED };
  }

  async summarize(userId: number, start: string, end: string) {
    const rows = await this.list(userId, undefined, start, end);
    const total = rows.reduce((sum, row) => sum + Number(row.carbonValue), 0);
    const byCategory = Object.values(ActivityCategory).map((category) => ({
      category,
      value: rows.filter((row) => row.category === category).reduce((sum, row) => sum + Number(row.carbonValue), 0)
    }));
    return { total: Number(total.toFixed(2)), byCategory, rows };
  }
}

