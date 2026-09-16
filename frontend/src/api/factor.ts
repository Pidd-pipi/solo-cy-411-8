import { ActivityCategory } from '../constants/activity';
import { CarbonFactor } from '../types/entities';
import { request } from '../utils/request';

export function fetchFactors(params?: { category?: ActivityCategory; region?: string }): Promise<CarbonFactor[]> {
  return request.get('/factors', { params });
}

export function createFactor(payload: Omit<CarbonFactor, 'id' | 'updatedAt'>): Promise<{ factor: CarbonFactor }> {
  return request.post('/factors', payload);
}

