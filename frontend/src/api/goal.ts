import { GoalStatus } from '../constants/goal';
import { Goal } from '../types/entities';
import { request } from '../utils/request';

export interface GoalPayload {
  title: string;
  targetValue: number;
  periodType: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
}

export function fetchGoals(): Promise<Goal[]> {
  return request.get('/goals');
}

export function createGoal(payload: GoalPayload): Promise<{ goal: Goal }> {
  return request.post('/goals', payload);
}

export function updateGoal(id: number, payload: Partial<GoalPayload>): Promise<{ goal: Goal }> {
  return request.patch(`/goals/${id}`, payload);
}

