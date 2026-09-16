import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { GoalProgressCard } from '../components/common/GoalProgressCard';
import { EmptyState } from '../components/common/EmptyState';
import { GoalStatus, GOAL_STATUS_LABELS } from '../constants/goal';
import { useGoalStore } from '../stores/goalStore';
import { useAuth } from '../hooks/useAuth';
import { Messages } from '../constants/messages';

export function Goals() {
  const [open, setOpen] = useState(false);
  const goals = useGoalStore((state) => state.goals);
  const load = useGoalStore((state) => state.load);
  const add = useGoalStore((state) => state.add);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void load();
  }, [load, token]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>目标管理</Typography.Title>
          <Typography.Text type="secondary">减排目标会直接联动活动汇总。</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>创建目标</Button>
      </Space>
      <div className="card-grid">
        {goals.length ? goals.map((goal) => <GoalProgressCard key={goal.id} goal={goal} />) : <EmptyState text="暂无减排目标" />}
      </div>
      <Modal title="创建目标" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ status: GoalStatus.ACTIVE, periodType: 'month', startDate: dayjs().startOf('month'), endDate: dayjs().endOf('month') }}
          onFinish={async (values) => {
            await add({ ...values, startDate: values.startDate.format('YYYY-MM-DD'), endDate: values.endDate.format('YYYY-MM-DD') });
            message.success(Messages.FRONTEND_GOAL_SAVED);
            setOpen(false);
          }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="targetValue" label="目标排放上限 kg CO2e" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodType" label="周期" rules={[{ required: true }]}><Select options={[{ value: 'week', label: '周' }, { value: 'month', label: '月' }, { value: 'quarter', label: '季度' }]} /></Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={Object.values(GoalStatus).map((value) => ({ value, label: GOAL_STATUS_LABELS[value] }))} /></Form.Item>
          <Form.Item name="startDate" label="开始日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="endDate" label="结束日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Button type="primary" htmlType="submit" block>保存目标</Button>
        </Form>
      </Modal>
    </Space>
  );
}
