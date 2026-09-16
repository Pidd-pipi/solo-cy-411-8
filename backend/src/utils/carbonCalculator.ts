import { ActivityCategory } from '../constants/activity';
import { logTemplate } from './logger';

export interface CarbonCalculationInput {
  category: ActivityCategory;
  amount: number;
  factorValue: number;
}

export function calculateCarbonValue(input: CarbonCalculationInput) {
  const carbonValue = Number((input.amount * input.factorValue).toFixed(2));
  logTemplate('info', 'ACTIVITY_CREATE_START', {
    userId: 0,
    category: input.category,
    subType: `factor:${input.factorValue}`
  });
  return carbonValue;
}

