export enum ActivityCategory {
  TRANSPORT = 'transport',
  ENERGY = 'energy',
  FOOD = 'food',
  SHOPPING = 'shopping'
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  [ActivityCategory.TRANSPORT]: '交通',
  [ActivityCategory.ENERGY]: '能源',
  [ActivityCategory.FOOD]: '餐饮',
  [ActivityCategory.SHOPPING]: '购物'
};

export const ACTIVITY_CATEGORY_COLORS: Record<ActivityCategory, string> = {
  [ActivityCategory.TRANSPORT]: 'blue',
  [ActivityCategory.ENERGY]: 'gold',
  [ActivityCategory.FOOD]: 'green',
  [ActivityCategory.SHOPPING]: 'purple'
};

