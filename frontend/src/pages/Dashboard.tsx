import { useEffect } from 'react';
import { Card, Col, Row, Space, Statistic, Typography } from 'antd';
import { CarbonTrendChart } from '../components/common/CarbonTrendChart';
import { GoalProgressCard } from '../components/common/GoalProgressCard';
import { EmptyState } from '../components/common/EmptyState';
import { useActivityStore } from '../stores/activityStore';
import { useGoalStore } from '../stores/goalStore';
import { useCarbonStats } from '../hooks/useCarbonStats';
import { useAuth } from '../hooks/useAuth';
import { getMonthRange } from '../utils/dateRange';
import { formatCarbon } from '../utils/formatters';

export function Dashboard() {
  const rows = useActivityStore((state) => state.rows);
  const loadActivities = useActivityStore((state) => state.load);
  const goals = useGoalStore((state) => state.goals);
  const loadGoals = useGoalStore((state) => state.load);
  const { token } = useAuth();
  const stats = useCarbonStats(rows);

  useEffect(() => {
    if (!token) return;
    const [start, end] = getMonthRange();
    void loadActivities({ start, end });
    void loadGoals();
  }, [loadActivities, loadGoals, token]);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>CarbonTrack 工作台</Typography.Title>
        <Typography.Text type="secondary">今日、周期和目标进度集中在一个视图中。</Typography.Text>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Card><Statistic title="今日排放" value={formatCarbon(stats.todayTotal)} /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="本周排放" value={formatCarbon(stats.weekTotal)} /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="本月排放" value={formatCarbon(stats.monthTotal)} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="碳排趋势">
            <CarbonTrendChart data={stats.trend} />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="目标进度">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {goals.length ? goals.slice(0, 3).map((goal) => <GoalProgressCard key={goal.id} goal={goal} />) : <EmptyState text="还没有减排目标" />}
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
