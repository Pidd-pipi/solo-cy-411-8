import { RankingItem } from '../types/entities';
import { request } from '../utils/request';

export function fetchRanking(params?: { region?: string; start?: string; end?: string }): Promise<RankingItem[]> {
  return request.get('/ranking', { params });
}
