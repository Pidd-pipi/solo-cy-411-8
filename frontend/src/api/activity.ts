import { ActivityCategory } from '../constants/activity';
import { Activity } from '../types/entities';
import { request } from '../utils/request';

export interface ActivityPayload {
  category: ActivityCategory;
  subType: string;
  amount: number;
  unit: string;
  recordDate: string;
  note?: string;
}

export function fetchActivities(params?: { category?: ActivityCategory; start?: string; end?: string }): Promise<Activity[]> {
  return request.get('/activities', { params });
}

export function createActivity(payload: ActivityPayload): Promise<{ activity: Activity }> {
  return request.post('/activities', payload);
}

export function updateActivity(id: number, payload: Partial<ActivityPayload>): Promise<{ activity: Activity }> {
  return request.patch(`/activities/${id}`, payload);
}

export function deleteActivity(id: number): Promise<{ message: string }> {
  return request.delete(`/activities/${id}`);
}

export function fetchActivitySummary(params: { start: string; end: string }): Promise<{ total: number; byCategory: { category: ActivityCategory; value: number }[]; rows: Activity[] }> {
  return request.get('/activities/summary', { params });
}

