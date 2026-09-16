// FactorStatus 是因子版本的“管理状态”（持久化在 carbon_factors.status）。
// 是否在某个日期生效，还要结合 effective_date 与该日期所属的生效区间判断。
export enum FactorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export const FACTOR_STATUS_LABELS: Record<FactorStatus, string> = {
  [FactorStatus.ACTIVE]: '启用',
  [FactorStatus.INACTIVE]: '停用'
};
