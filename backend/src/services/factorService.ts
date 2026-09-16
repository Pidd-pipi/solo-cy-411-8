import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { createHash } from 'node:crypto';
import { DataSource, LessThanOrEqual, Not, Repository } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { FactorStatus } from '../constants/factor';
import { Messages } from '../constants/messages';
import { Activity } from '../models/activity';
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

export interface FactorPublishInput extends FactorInput {
  effectiveDate: string;
}

export interface FactorAmendInput {
  factorValue?: number;
  unit?: string;
  effectiveDate?: string;
}

interface FactorIdentity {
  category: ActivityCategory;
  subType: string;
  region: string;
}

// MySQL 唯一键冲突的 errno
const ER_DUP_ENTRY = 1062;

@Injectable()
export class FactorService {
  constructor(
    @InjectRepository(CarbonFactor) private readonly factorRepo: Repository<CarbonFactor>,
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>,
    private readonly dataSource: DataSource
  ) {}

  async list(category?: ActivityCategory, region?: string, includeInactive = false) {
    logTemplate('info', 'FACTOR_LIST_START');
    return this.factorRepo.find({
      where: {
        ...(category ? { category } : {}),
        ...(region ? { region } : {}),
        ...(includeInactive ? {} : { status: FactorStatus.ACTIVE })
      },
      order: { region: 'ASC', category: 'ASC', subType: 'ASC', effectiveDate: 'DESC', version: 'DESC' }
    });
  }

  /**
   * 按活动日期匹配“当时生效”的因子版本。
   * 生效区间为左闭右开 [effective_date, 下一版本 effective_date)，
   * 故取 effective_date <= recordDate 中最近的一个启用版本。
   */
  async findEffectiveAt(category: ActivityCategory, subType: string, region: string, date: string): Promise<CarbonFactor> {
    const recordDate = dayjs(date).format('YYYY-MM-DD');
    const factor = await this.factorRepo.findOne({
      where: {
        category,
        subType,
        region,
        status: FactorStatus.ACTIVE,
        effectiveDate: LessThanOrEqual(recordDate)
      },
      order: { effectiveDate: 'DESC', version: 'DESC' }
    });
    if (!factor) {
      logTemplate('warn', 'FACTOR_MATCH_FAILED', { category, subType, region, date: recordDate, reason: 'no effective version' });
      throw new AppError(
        ErrorCodes.FACTOR_NOT_FOUND,
        `CarbonFactor[category=${category} sub_type=${subType} region=${region}] match failed: no effective version at date ${recordDate}`,
        HttpStatus.NOT_FOUND
      );
    }
    logTemplate('info', 'FACTOR_MATCH', { category, subType, region, date: recordDate, id: factor.id, version: factor.version });
    return factor;
  }

  /**
   * 发布新版本：
   * - effective_date 必须是今天或未来（只能发布“未来生效”，不能回填过去）；
   * - 同一地区/分类/子类型在该日期不能已有版本（不重叠 + 并发只成功一次，
   *   uk_factor_version 唯一约束兜底，竞态时第二个请求收到 409）；
   * - 版本号在该 identity 内取 max(version)+1。
   */
  async publish(input: FactorPublishInput) {
    this.assertCategory(input.category);
    const effectiveDate = this.assertDate(input.effectiveDate);
    if (dayjs(effectiveDate).isBefore(dayjs().format('YYYY-MM-DD'))) {
      logTemplate('warn', 'FACTOR_PUBLISH_FAILED', { ...this.identLog(input), field: 'CarbonFactor.effective_date', reason: 'must not be in the past' });
      throw new AppError(
        ErrorCodes.FACTOR_EFFECTIVE_DATE_INVALID,
        `CarbonFactor[category=${input.category} sub_type=${input.subType} region=${input.region}] publish failed: effective_date ${effectiveDate} is in the past`,
        HttpStatus.BAD_REQUEST
      );
    }

    logTemplate('info', 'FACTOR_PUBLISH_START', { ...this.identLog(input), effectiveDate });

    // 用“按因子身份命名的事务级咨询锁”串行化同一 region+category+sub_type 的并发发布，
    // 保证版本号读取-自增与日期唯一性检查在同一临界区完成；不同因子之间互不阻塞。
    const lockKey = this.identityLockKey(input);
    let lockHeld = false;
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const locked = await manager.query('SELECT GET_LOCK(?, 10) AS acquired', [lockKey]);
        if (Number(locked?.[0]?.acquired ?? 0) !== 1) {
          throw new AppError(
            ErrorCodes.FACTOR_VERSION_CONFLICT,
            `CarbonFactor publish failed: concurrent publish in progress, please retry`,
            HttpStatus.CONFLICT
          );
        }
        lockHeld = true;
        const txFactorRepo = manager.getRepository(CarbonFactor);

        const duplicate = await txFactorRepo.findOne({
          where: { category: input.category, subType: input.subType, region: input.region, effectiveDate }
        });
        if (duplicate) {
          this.throwVersionConflict(input, effectiveDate, duplicate.id);
        }

        const latest = await txFactorRepo.findOne({
          where: { category: input.category, subType: input.subType, region: input.region },
          order: { version: 'DESC' }
        });
        const nextVersion = (latest?.version ?? 0) + 1;

        return txFactorRepo.save(
          txFactorRepo.create({
            category: input.category,
            subType: input.subType,
            factorValue: String(input.factorValue),
            unit: input.unit,
            region: input.region,
            version: nextVersion,
            effectiveDate,
            status: FactorStatus.ACTIVE
          })
        );
      });
      logTemplate('info', 'FACTOR_PUBLISH_SUCCESS', { id: saved.id, version: saved.version, effectiveDate: saved.effectiveDate });
      return { message: Messages.FACTOR_VERSION_PUBLISHED, factor: saved };
    } catch (error: any) {
      // 唯一键兜底（不同日期并发也不会撞版本号；同日期并发第二条收到 409）。
      if (error?.errno === ER_DUP_ENTRY || error?.code === 'ER_DUP_ENTRY') {
        const existing = await this.factorRepo.findOne({
          where: { category: input.category, subType: input.subType, region: input.region, effectiveDate }
        });
        if (existing) this.throwVersionConflict(input, effectiveDate, existing.id);
        throw new AppError(
          ErrorCodes.FACTOR_VERSION_CONFLICT,
          `CarbonFactor[category=${input.category} sub_type=${input.subType} region=${input.region}] publish failed: concurrent version conflict, please retry`,
          HttpStatus.CONFLICT
        );
      }
      throw error;
    } finally {
      // 显式释放，避免连接归还连接池后仍持有命名锁。
      if (lockHeld) {
        try {
          await this.dataSource.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        } catch {
          // 释放失败不影响发布结果；连接关闭时 MySQL 也会自动回收。
        }
      }
    }
  }

  /**
   * 修正尚未生效的版本：
   * - 目标版本必须存在；
   * - 已经生效（effective_date <= 今天）的版本不可修正，避免改变旧活动口径；
   * - 没有任何活动固化到该版本时才允许（未来日期通常没有活动引用）；
   * - 调整 effective_date 后仍需保持日期唯一（拒绝重叠，并发同样由唯一键兜底）。
   */
  async amend(id: number, input: FactorAmendInput) {
    const factor = await this.factorRepo.findOne({ where: { id } });
    if (!factor) {
      throw new AppError(ErrorCodes.FACTOR_NOT_FOUND, `CarbonFactor[id=${id}] amend failed: id not found`, HttpStatus.NOT_FOUND);
    }
    logTemplate('info', 'FACTOR_AMEND_START', { id, version: factor.version });

    // 生效日为今天即视为“已经生效”，与前端 amendable（严格晚于今天）保持一致。
    if (!dayjs(factor.effectiveDate).isAfter(dayjs().format('YYYY-MM-DD'))) {
      logTemplate('warn', 'FACTOR_AMEND_FAILED', { id, field: 'CarbonFactor.effective_date', reason: 'already effective' });
      throw new AppError(
        ErrorCodes.FACTOR_VERSION_EFFECTIVE,
        `CarbonFactor[id=${id}] amend failed: version ${factor.version} effective since ${factor.effectiveDate} is locked`,
        HttpStatus.CONFLICT
      );
    }

    const referenced = await this.activityRepo.count({ where: { factorId: id } });
    if (referenced > 0) {
      logTemplate('warn', 'FACTOR_AMEND_FAILED', { id, field: 'CarbonFactor.id', reason: `referenced by ${referenced} activities` });
      throw new AppError(
        ErrorCodes.FACTOR_VERSION_REFERENCED,
        `CarbonFactor[id=${id}] amend failed: version ${factor.version} is pinned by ${referenced} activity(ies)`,
        HttpStatus.CONFLICT
      );
    }

    if (input.factorValue !== undefined) factor.factorValue = String(input.factorValue);
    if (input.unit !== undefined) factor.unit = input.unit;

    if (input.effectiveDate !== undefined) {
      const nextDate = this.assertDate(input.effectiveDate);
      if (dayjs(nextDate).isBefore(dayjs().format('YYYY-MM-DD'))) {
        throw new AppError(
          ErrorCodes.FACTOR_EFFECTIVE_DATE_INVALID,
          `CarbonFactor[id=${id}] amend failed: effective_date ${nextDate} is in the past`,
          HttpStatus.BAD_REQUEST
        );
      }
      const clash = await this.factorRepo.findOne({
        where: { category: factor.category, subType: factor.subType, region: factor.region, effectiveDate: nextDate, id: Not(id) }
      });
      if (clash) {
        this.throwVersionConflict({ category: factor.category, subType: factor.subType, region: factor.region }, nextDate, clash.id);
      }
      factor.effectiveDate = nextDate;
    }

    try {
      const saved = await this.factorRepo.save(factor);
      logTemplate('info', 'FACTOR_AMEND_SUCCESS', { id: saved.id, version: saved.version });
      return { message: Messages.FACTOR_VERSION_AMENDED, factor: saved };
    } catch (error: any) {
      if (error?.errno === ER_DUP_ENTRY || error?.code === 'ER_DUP_ENTRY') {
        this.throwVersionConflict({ category: factor.category, subType: factor.subType, region: factor.region }, factor.effectiveDate);
      }
      throw error;
    }
  }

  /**
   * 停用 / 启用版本。
   * 停用只影响后续“按日期匹配”，已固化到该版本的活动不会改变（factorId 仍指向它）。
   * 重新启用永远安全：它只是重新出现在生效时间轴上，不会覆盖其它日期的版本。
   */
  async setStatus(id: number, status: FactorStatus) {
    if (!Object.values(FactorStatus).includes(status)) {
      throw new AppError(
        ErrorCodes.FACTOR_STATUS_INVALID,
        `CarbonFactor[id=${id}] status change failed: status ${status} invalid`,
        HttpStatus.BAD_REQUEST
      );
    }
    const factor = await this.factorRepo.findOne({ where: { id } });
    if (!factor) {
      throw new AppError(ErrorCodes.FACTOR_NOT_FOUND, `CarbonFactor[id=${id}] status change failed: id not found`, HttpStatus.NOT_FOUND);
    }
    factor.status = status;
    const saved = await this.factorRepo.save(factor);
    logTemplate('info', 'FACTOR_STATUS_CHANGE', { id: saved.id, version: saved.version, status: saved.status });
    return { message: Messages.FACTOR_STATUS_UPDATED, factor: saved };
  }

  // 兼容旧调用点（无日期参数时按今天生效版本匹配）。
  async findMatching(category: ActivityCategory, subType: string, region: string) {
    return this.findEffectiveAt(category, subType, region, dayjs().format('YYYY-MM-DD'));
  }

  // 旧的 POST /factors 保留可用：作为“立即/未来生效的新版本发布”。
  async create(input: FactorPublishInput) {
    return this.publish(input);
  }

  private assertCategory(category: ActivityCategory) {
    if (!Object.values(ActivityCategory).includes(category)) {
      logTemplate('warn', 'FACTOR_PUBLISH_FAILED', { region: '-', category: String(category), subType: '-', field: 'CarbonFactor.category', reason: 'invalid enum' });
      throw new AppError(
        ErrorCodes.ACTIVITY_CATEGORY_INVALID,
        `CarbonFactor[category=${category}] publish failed: category invalid`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private assertDate(value: string): string {
    const d = dayjs(value);
    if (!value || !d.isValid()) {
      throw new AppError(
        ErrorCodes.FACTOR_EFFECTIVE_DATE_INVALID,
        `CarbonFactor publish failed: effective_date ${value} invalid (YYYY-MM-DD)`,
        HttpStatus.BAD_REQUEST
      );
    }
    return d.format('YYYY-MM-DD');
  }

  private identLog(identity: FactorIdentity) {
    return { region: identity.region, category: identity.category, subType: identity.subType };
  }

  // MySQL GET_LOCK 的 key 上限 64 字符，用 sha1 压缩“地区|分类|子类型”。
  private identityLockKey(identity: FactorIdentity) {
    return `ctf_${createHash('sha1').update(`${identity.region}|${identity.category}|${identity.subType}`).digest('hex').slice(0, 40)}`;
  }

  private throwVersionConflict(identity: FactorIdentity, effectiveDate: string, existingId?: number): never {
    logTemplate('warn', 'FACTOR_PUBLISH_FAILED', {
      ...this.identLog(identity),
      field: 'CarbonFactor.effective_date',
      reason: `overlap/duplicate at ${effectiveDate}`
    });
    throw new AppError(
      ErrorCodes.FACTOR_VERSION_CONFLICT,
      `CarbonFactor[category=${identity.category} sub_type=${identity.subType} region=${identity.region}] publish failed: a version already covers effective_date ${effectiveDate}` +
        (existingId ? ` (existing id=${existingId})` : ''),
      HttpStatus.CONFLICT
    );
  }
}
