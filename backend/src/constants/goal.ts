export enum GoalStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired'
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  [GoalStatus.PENDING]: 'Pending',
  [GoalStatus.ACTIVE]: 'Active',
  [GoalStatus.COMPLETED]: 'Completed',
  [GoalStatus.EXPIRED]: 'Expired'
};

export const GOAL_STATUS_ERROR_FIELDS = {
  STATUS: 'Goal.status',
  TARGET_VALUE: 'Goal.target_value'
};

