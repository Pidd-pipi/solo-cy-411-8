import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { ActivityCategory } from '../../constants/activity';
import { formatActivityCategory } from '../../utils/formatters';

interface TrendPoint {
  date: string;
  value: number;
  category?: ActivityCategory;
}

export function CarbonTrendChart({ data }: { data: TrendPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const grouped = data.reduce<Record<string, number>>((acc, row) => {
      acc[row.date] = (acc[row.date] || 0) + row.value;
      return acc;
    }, {});
    const dates = Object.keys(grouped);
    chart.setOption({
      color: ['#2f7d59'],
      grid: { left: 36, right: 16, top: 20, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => `${params[0].axisValue}<br/>${formatActivityCategory(data[params[0].dataIndex]?.category || ActivityCategory.ENERGY)} ${params[0].value} kg CO2e`
      },
      xAxis: { type: 'category', boundaryGap: false, data: dates },
      yAxis: { type: 'value', name: 'kg CO2e' },
      series: [
        {
          name: '排放量',
          type: 'line',
          smooth: true,
          areaStyle: { color: 'rgba(47, 125, 89, 0.12)' },
          data: dates.map((date) => Number(grouped[date].toFixed(2)))
        }
      ]
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [data]);

  return <div className="chart-panel" ref={ref} />;
}

