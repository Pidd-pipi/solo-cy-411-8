import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Pagination, Select, Space, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ActivityCard } from '../components/common/ActivityCard';
import { EmptyState } from '../components/common/EmptyState';
import { ActivityCategory, ACTIVITY_CATEGORY_LABELS } from '../constants/activity';
import { useActivityStore } from '../stores/activityStore';
import { useAuth } from '../hooks/useAuth';
import { usePagination } from '../hooks/usePagination';
import { Messages } from '../constants/messages';

export function Activities() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ActivityCategory | undefined>();
  const rows = useActivityStore((state) => state.rows);
  const load = useActivityStore((state) => state.load);
  const add = useActivityStore((state) => state.add);
  const { token } = useAuth();
  const filtered = useMemo(() => (category ? rows.filter((row) => row.category === category) : rows), [rows, category]);
  const pagination = usePagination(filtered, 5);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [load, token]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>活动记录</Typography.Title>
          <Typography.Text type="secondary">按分类筛选日常碳排活动。</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增活动</Button>
      </Space>
      <Select
        allowClear
        placeholder="按分类筛选"
        value={category}
        onChange={setCategory}
        style={{ width: 220 }}
        options={Object.values(ActivityCategory).map((value) => ({ value, label: ACTIVITY_CATEGORY_LABELS[value] }))}
      />
      <div className="card-grid">
        {pagination.currentRows.length ? pagination.currentRows.map((activity) => <ActivityCard key={activity.id} activity={activity} />) : <EmptyState text="暂无活动记录" />}
      </div>
      <Pagination current={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onChange={(page, size) => { pagination.setPage(page); pagination.setPageSize(size); }} />
      <Modal title="新增活动" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ category: ActivityCategory.TRANSPORT, subType: 'metro', unit: 'km', recordDate: dayjs() }}
          onFinish={async (values) => {
            await add({ ...values, recordDate: values.recordDate.format('YYYY-MM-DD') });
            message.success(Messages.FRONTEND_ACTIVITY_SAVED);
            setOpen(false);
          }}
        >
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={Object.values(ActivityCategory).map((value) => ({ value, label: ACTIVITY_CATEGORY_LABELS[value] }))} />
          </Form.Item>
          <Form.Item name="subType" label="子类型" rules={[{ required: true }]}>
            <Input placeholder="metro / electricity / beef-meal / parcel" />
          </Form.Item>
          <Form.Item name="amount" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="recordDate" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>保存</Button>
        </Form>
      </Modal>
    </Space>
  );
}
