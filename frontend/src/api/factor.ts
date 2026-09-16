import { ActivityCategory } from '../constants/activity';
import { FactorStatus } from '../constants/factor';
import { CarbonFactor } from '../types/entities';
import { request } from '../utils/request';

export interface FactorPublishPayload {
  category: ActivityCategory;
  subType: string;
  factorValue: number;
  unit: string;
  region: string;
  effectiveDate: string;
}

export interface FactorAmendPayload {
  factorValue?: number;
  unit?: string;
  effectiveDate?: string;
}

export function fetchFactors(params?: {
  category?: ActivityCategory;
  region?: string;
  includeInactive?: boolean;
}): Promise<CarbonFactor[]> {
  return request.get('/factors', {
    params: { ...params, includeInactive: params?.includeInactive === false ? 'false' : 'true' }
  });
}

// 发布新版本（可指定未来生效日期）；重叠/并发时后端返回 409。
export function publishFactor(payload: FactorPublishPayload): Promise<{ message: string; factor: CarbonFactor }> {
  return request.post('/factors', payload);
}

// 修正尚未生效的版本。
export function amendFactor(id: number, payload: FactorAmendPayload): Promise<{ message: string; factor: CarbonFactor }> {
  return request.patch(`/factors/${id}`, payload);
}

// 停用 / 重新启用版本（不影响已引用活动）。
export function setFactorStatus(id: number, status: FactorStatus): Promise<{ message: string; factor: CarbonFactor }> {
  return request.patch(`/factors/${id}/status`, { status });
}
