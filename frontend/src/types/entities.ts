import { ActivityCategory } from '../constants/activity';
import { FactorStatus } from '../constants/factor';
import { GoalStatus } from '../constants/goal';

export interface User {
  id: number;
  username: string;
  email: string;
  avatar?: string | null;
  region: string;
  createdAt?: string;
  roles?: string[];
}

export interface CarbonFactor {
  id: number;
  category: ActivityCategory;
  subType: string;
  factorValue: string;
  unit: string;
  region: string;
  // 版本化字段
  version: number;
  effectiveDate: string;
  status: FactorStatus;
  createdAt?: string;
  updatedAt: string;
}

export interface Activity {
  id: number;
  userId: number;
  factorId?: number | null;
  // 固化的因子版本快照：不随后续发布/停用而变化
  factorVersion?: number | null;
  factorValueSnapshot?: string | null;
  factorEffectiveDate?: string | null;
  category: ActivityCategory;
  subType: string;
  amount: string;
  unit: string;
  carbonValue: string;
  recordDate: string;
  note?: string | null;
  factor?: CarbonFactor | null;
}

export interface Goal {
  id: number;
  userId: number;
  title: string;
  targetValue: string;
  periodType: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  currentValue?: number;
  progress?: number;
}

export interface AuditLog {
  id: number;
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  detail: string;
  ip?: string | null;
  createdAt: string;
}

export interface RankingItem {
  rank: number;
  userId: number;
  username: string;
  region: string;
  avatar?: string | null;
  totalCarbon: number;
}

