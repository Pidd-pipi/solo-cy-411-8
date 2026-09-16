import dayjs from 'dayjs';

export function getTodayRange() {
  return [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] as const;
}

export function getWeekRange() {
  return [dayjs().startOf('week').format('YYYY-MM-DD'), dayjs().endOf('week').format('YYYY-MM-DD')] as const;
}

export function getMonthRange() {
  return [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')] as const;
}

export function getYearRange() {
  return [dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().endOf('year').format('YYYY-MM-DD')] as const;
}

