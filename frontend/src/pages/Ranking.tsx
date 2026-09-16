import { useEffect, useState } from 'react';
import { Avatar, Card, List, Select, Space, Typography } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { fetchRanking } from '../api/ranking';
import { CategoryBadge } from '../components/common/CategoryBadge';
import { EmptyState } from '../components/common/EmptyState';
import { ActivityCategory } from '../constants/activity';
import { RankingItem } from '../types/entities';
import { formatCarbon } from '../utils/formatters';
import { useAuth } from '../hooks/useAuth';

export function Ranking() {
  const [region, setRegion] = useState<string | undefined>();
  const [rows, setRows] = useState<RankingItem[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void fetchRanking({ region }).then(setRows);
  }, [region, token]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>排行榜</Typography.Title>
        <Typography.Text type="secondary">排放越低排名越靠前。</Typography.Text>
      </div>
      <Select allowClear placeholder="按地区筛选" value={region} onChange={setRegion} style={{ width: 220 }} options={['Shanghai', 'Hangzhou', 'Beijing'].map((value) => ({ value, label: value }))} />
      <Card>
        {rows.length ? (
          <List
            dataSource={rows}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar src={item.avatar || undefined}>{item.rank}</Avatar>}
                  title={<Space><TrophyOutlined />#{item.rank} {item.username}<CategoryBadge category={ActivityCategory.TRANSPORT} /></Space>}
                  description={`${item.region} · ${formatCarbon(item.totalCarbon)}`}
                />
              </List.Item>
            )}
          />
        ) : <EmptyState text="暂无排行榜数据" />}
      </Card>
    </Space>
  );
}
