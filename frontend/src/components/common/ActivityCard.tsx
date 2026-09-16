import { Card, Space, Tag, Tooltip, Typography } from 'antd';
import { Activity } from '../../types/entities';
import { formatCarbon, formatDate } from '../../utils/formatters';
import { CategoryBadge } from './CategoryBadge';

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Card className="activity-card" size="small">
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <CategoryBadge category={activity.category} />
          <Typography.Text strong>{formatCarbon(activity.carbonValue)}</Typography.Text>
        </Space>
        <Typography.Text>{activity.subType} · {Number(activity.amount).toFixed(2)} {activity.unit}</Typography.Text>
        <div className="split-line">
          <span>{formatDate(activity.recordDate)}</span>
          <span>{activity.note || '无备注'}</span>
        </div>
        {activity.factorVersion != null && (
          <Tooltip title={`按活动日期固化的因子版本（生效于 ${activity.factorEffectiveDate || '-'}），后续发布不会重算`}>
            <Tag>因子 v{activity.factorVersion}</Tag>
          </Tooltip>
        )}
      </Space>
    </Card>
  );
}

