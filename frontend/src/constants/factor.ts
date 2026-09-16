// 与后端 backend/src/constants/factor.ts 保持一致
export enum FactorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export const FACTOR_STATUS_LABELS: Record<FactorStatus, string> = {
  [FactorStatus.ACTIVE]: '启用中',
  [FactorStatus.INACTIVE]: '已停用'
};

export const FACTOR_VERSION_MESSAGES = {
  published: '新因子版本已发布',
  amended: '未生效版本已修正',
  activated: '因子版本已重新启用',
  deactivated: '因子版本已停用，已引用的活动结果保持不变',
  futureOnly: '只能发布今天或未来生效的版本',
  amendLocked: '该版本已经生效，不能修正；请发布新版本'
};
