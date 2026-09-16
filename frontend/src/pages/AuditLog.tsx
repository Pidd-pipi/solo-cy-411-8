import { useEffect, useState } from 'react';
import { Card, Table, Typography } from 'antd';
import { fetchAuditLogs } from '../api/audit';
import { AuditLog as AuditLogType } from '../types/entities';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../hooks/useAuth';

export function AuditLog() {
  const [rows, setRows] = useState<AuditLogType[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void fetchAuditLogs().then(setRows);
  }, [token]);

  return (
    <Card>
      <Typography.Title level={2}>操作日志</Typography.Title>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '时间', dataIndex: 'createdAt', render: formatDate },
          { title: '用户', dataIndex: 'userId' },
          { title: '实体', dataIndex: 'entity' },
          { title: '动作', dataIndex: 'action' },
          { title: '详情', dataIndex: 'detail' }
        ]}
      />
    </Card>
  );
}
