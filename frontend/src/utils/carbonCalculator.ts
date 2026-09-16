import { ActivityCategory } from '../constants/activity';
import { CarbonFactor } from '../types/entities';

export function calculateCarbonValue(category: ActivityCategory, amount: number, factor?: CarbonFactor | null) {
  if (!factor || factor.category !== category) return 0;
  return Number((amount * Number(factor.factorValue)).toFixed(2));
}

