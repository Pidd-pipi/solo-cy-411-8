import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { amendFactor, fetchFactors, publishFactor, setFactorStatus } from '../api/factor';
import { CategoryBadge } from '../components/common/CategoryBadge';
import { EmptyState } from '../components/common/EmptyState';
import { ActivityCategory, ACTIVITY_CATEGORY_LABELS } from '../constants/activity';
import { FactorStatus, FACTOR_STATUS_LABELS, FACTOR_VERSION_MESSAGES } from '../constants/factor';
import { useAuth } from '../hooks/useAuth';
import { CarbonFactor } from '../types/entities';

const today = dayjs().format('YYYY-MM-DD');

export function Factors() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes('admin'));
  const [rows, setRows] = useState<CarbonFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<CarbonFactor | null>(null);
  const [publishForm] = Form.useForm();
  const [amendForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchFactors({ includeInactive: true }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 按地区/分类/子类型分组，便于看出同一因子的版本时间轴。
  const groupedCount = useMemo(() => new Set(rows.map((r) => `${r.region}|${r.category}|${r.subType}`)).size, [rows]);

  const amendable = (record: CarbonFactor) => dayjs(record.effectiveDate).isAfter(today, 'day');

  const columns = [
    { title: '地区', dataIndex: 'region', width: 110 },
    { title: '分类', dataIndex: 'category', width: 100, render: (value: ActivityCategory) => <CategoryBadge category={value} /> },
    { title: '子类型', dataIndex: 'subType', width: 150 },
    { title: '版本', dataIndex: 'version', width: 80, render: (v: number) => <Tag>v{v}</Tag> },
    {
      title: '因子值',
      dataIndex: 'factorValue',
      width: 120,
      render: (value: string, record: CarbonFactor) => `${Number(value).toFixed(4)} / ${record.unit}`
    },
    {
      title: '生效日期',
      dataIndex: 'effectiveDate',
      width: 130,
      render: (value: string) => (
        <Space size={6}>
          <span>{value}</span>
          {dayjs(value).isAfter(today, 'day') && <Tag color="processing">未生效</Tag>}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: FactorStatus) => <Tag color={value === FactorStatus.ACTIVE ? 'green' : 'default'}>{FACTOR_STATUS_LABELS[value]}</Tag>
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: CarbonFactor) =>
        isAdmin ? (
          <Space>
            <Button size="small" disabled={!amendable(record)} onClick={() => setAmendTarget(record)}>
              修正
            </Button>
            {record.status === FactorStatus.ACTIVE ? (
              <Popconfirm
                title="停用该版本？"
                description="已引用它的活动结果不会改变，仅影响之后的匹配。"
                onConfirm={async () => {
                  await setFactorStatus(record.id, FactorStatus.INACTIVE);
                  message.success(FACTOR_VERSION_MESSAGES.deactivated);
                  await load();
                }}
              >
                <Button size="small" danger>停用</Button>
              </Popconfirm>
            ) : (
              <Button
                size="small"
                onClick={async () => {
                  await setFactorStatus(record.id, FactorStatus.ACTIVE);
                  message.success(FACTOR_VERSION_MESSAGES.activated);
                  await load();
                }}
              >
                启用
              </Button>
            )}
          </Space>
        ) : null
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>排放因子版本</Typography.Title>
          <Typography.Text type="secondary">
            共 {groupedCount} 个地区因子，{rows.length} 个版本。同一地区/分类/子类型按生效日期形成互不重叠的时间轴。
          </Typography.Text>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPublishOpen(true)}>
            发布新版本
          </Button>
        )}
      </Space>

      {rows.length === 0 && !loading ? (
        <EmptyState text="暂无因子版本" />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          size="middle"
        />
      )}

      {/* 发布新版本：生效日期只能是今天或未来 */}
      <Modal title="发布因子新版本" open={publishOpen} onCancel={() => setPublishOpen(false)} footer={null} destroyOnClose>
        <Form
          form={publishForm}
          layout="vertical"
          initialValues={{ category: ActivityCategory.ENERGY, unit: 'kWh', effectiveDate: dayjs().add(1, 'day') }}
          onFinish={async (values) => {
            await publishFactor({ ...values, effectiveDate: values.effectiveDate.format('YYYY-MM-DD') });
            message.success(FACTOR_VERSION_MESSAGES.published);
            setPublishOpen(false);
            publishForm.resetFields();
            await load();
          }}
        >
          <Form.Item name="region" label="地区" rules={[{ required: true }]}>
            <Input placeholder="Shanghai / Hangzhou / Beijing" />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={Object.values(ActivityCategory).map((value) => ({ value, label: ACTIVITY_CATEGORY_LABELS[value] }))} />
          </Form.Item>
          <Form.Item name="subType" label="子类型" rules={[{ required: true }]}>
            <Input placeholder="electricity / metro / bus ..." />
          </Form.Item>
          <Form.Item name="factorValue" label="因子值" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="effectiveDate"
            label="生效日期"
            extra={FACTOR_VERSION_MESSAGES.futureOnly}
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => Boolean(d && d.isBefore(dayjs().startOf('day')))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>发布</Button>
        </Form>
      </Modal>

      {/* 修正尚未生效的版本 */}
      <Modal
        title={amendTarget ? `修正 v${amendTarget.version}（${amendTarget.region} · ${amendTarget.subType}）` : ''}
        open={Boolean(amendTarget)}
        onCancel={() => setAmendTarget(null)}
        footer={null}
        destroyOnClose
      >
        {amendTarget && (
          <Form
            form={amendForm}
            layout="vertical"
            initialValues={{
              factorValue: Number(amendTarget.factorValue),
              unit: amendTarget.unit,
              effectiveDate: dayjs(amendTarget.effectiveDate)
            }}
            onFinish={async (values) => {
              await amendFactor(amendTarget.id, {
                factorValue: values.factorValue,
                unit: values.unit,
                effectiveDate: values.effectiveDate.format('YYYY-MM-DD')
              });
              message.success(FACTOR_VERSION_MESSAGES.amended);
              setAmendTarget(null);
              await load();
            }}
          >
            <Form.Item name="factorValue" label="因子值" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="effectiveDate" label="生效日期" extra={FACTOR_VERSION_MESSAGES.futureOnly} rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => Boolean(d && d.isBefore(dayjs().startOf('day')))} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>保存修正</Button>
          </Form>
        )}
      </Modal>
    </Space>
  );
}
