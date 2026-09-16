import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Activity } from '../types/entities';

export function useCarbonStats(rows: Activity[]) {
  return useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const weekStart = dayjs().startOf('week');
    const monthStart = dayjs().startOf('month');
    const todayTotal = rows.filter((row) => row.recordDate === today).reduce((sum, row) => sum + Number(row.carbonValue), 0);
    const weekTotal = rows.filter((row) => dayjs(row.recordDate).isAfter(weekStart.subtract(1, 'day'))).reduce((sum, row) => sum + Number(row.carbonValue), 0);
    const monthTotal = rows.filter((row) => dayjs(row.recordDate).isAfter(monthStart.subtract(1, 'day'))).reduce((sum, row) => sum + Number(row.carbonValue), 0);
    const trend = rows
      .slice()
      .sort((a, b) => a.recordDate.localeCompare(b.recordDate))
      .map((row) => ({ date: row.recordDate, value: Number(row.carbonValue), category: row.category }));
    return {
      todayTotal: Number(todayTotal.toFixed(2)),
      weekTotal: Number(weekTotal.toFixed(2)),
      monthTotal: Number(monthTotal.toFixed(2)),
      trend
    };
  }, [rows]);
}

