import { Card, Progress, Space, Tag, Typography } from 'antd';
import { GoalStatus, GOAL_STATUS_COLORS } from '../../constants/goal';
import { Goal } from '../../types/entities';
import { formatCarbon, formatDate, formatGoalStatus } from '../../utils/formatters';

export function GoalProgressCard({ goal }: { goal: Goal }) {
  const progress = Number(goal.progress || 0);
  return (
    <Card className="goal-card" size="small">
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>{goal.title}</Typography.Text>
            <div className="muted">{formatDate(goal.startDate)} - {formatDate(goal.endDate)}</div>
          </div>
          <Tag color={GOAL_STATUS_COLORS[goal.status || GoalStatus.ACTIVE]}>{formatGoalStatus(goal.status)}</Tag>
        </Space>
        <Progress percent={progress} strokeColor={progress > 90 ? '#c84f31' : '#2f7d59'} />
        <div className="split-line">
          <span>{formatCarbon(goal.currentValue || 0)}</span>
          <span>目标 {formatCarbon(goal.targetValue)}</span>
        </div>
      </Space>
    </Card>
  );
}

