import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { CarbonFactor } from '../models/carbonFactor';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

export interface FactorInput {
  category: ActivityCategory;
  subType: string;
  factorValue: number;
  unit: string;
  region: string;
}

@Injectable()
export class FactorService {
  constructor(@InjectRepository(CarbonFactor) private readonly factorRepo: Repository<CarbonFactor>) {}

  async list(category?: ActivityCategory, region?: string) {
    logTemplate('info', 'FACTOR_LIST_START');
    return this.factorRepo.find({
      where: {
        ...(category ? { category } : {}),
        ...(region ? { region } : {})
      },
      order: { category: 'ASC', region: 'ASC', subType: 'ASC' }
    });
  }

  async findMatching(category: ActivityCategory, subType: string, region: string) {
    const factor = await this.factorRepo.findOne({ where: { category, subType, region } });
    if (!factor) {
      throw new AppError(ErrorCodes.FACTOR_NOT_FOUND, `CarbonFactor[category=${category}] read failed: sub_type ${subType} region ${region}`);
    }
    return factor;
  }

  async create(input: FactorInput) {
    if (!Object.values(ActivityCategory).includes(input.category)) {
      logTemplate('warn', 'FACTOR_CREATE_FAILED', { id: 0, field: 'CarbonFactor.category', reason: 'invalid enum' });
      throw new AppError(ErrorCodes.ACTIVITY_CATEGORY_INVALID, `CarbonFactor[category=${input.category}] create failed: category invalid`);
    }
    const saved = await this.factorRepo.save(
      this.factorRepo.create({
        category: input.category,
        subType: input.subType,
        factorValue: String(input.factorValue),
        unit: input.unit,
        region: input.region
      })
    );
    logTemplate('info', 'FACTOR_CREATE_SUCCESS', { id: saved.id, category: saved.category, region: saved.region });
    return { message: Messages.FACTOR_CREATED, factor: saved };
  }
}

