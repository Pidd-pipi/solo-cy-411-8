export enum ActivityCategory {
  TRANSPORT = 'transport',
  ENERGY = 'energy',
  FOOD = 'food',
  SHOPPING = 'shopping'
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  [ActivityCategory.TRANSPORT]: 'Transport',
  [ActivityCategory.ENERGY]: 'Energy',
  [ActivityCategory.FOOD]: 'Food',
  [ActivityCategory.SHOPPING]: 'Food & shopping'
};

export const ACTIVITY_CATEGORY_ERROR_FIELDS = {
  CATEGORY: 'Activity.category',
  SUB_TYPE: 'Activity.sub_type',
  CARBON_FACTOR_CATEGORY: 'CarbonFactor.category'
};

