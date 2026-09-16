import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Form, Input, Layout, Menu, Modal, Space, Typography } from 'antd';
import { AuditOutlined, BarChartOutlined, FlagOutlined, LogoutOutlined, OrderedListOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from './stores/authStore';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { requireRole } from './router/guards';

const navItems = [
  { key: '/dashboard', icon: <BarChartOutlined />, label: '仪表盘' },
  { key: '/activities', icon: <OrderedListOutlined />, label: '活动' },
  { key: '/goals', icon: <FlagOutlined />, label: '目标' },
  { key: '/ranking', icon: <TeamOutlined />, label: '排行' },
  { key: '/profile', icon: <UserOutlined />, label: '个人' },
  { key: '/audit', icon: <AuditOutlined />, label: '审计', admin: true }
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const visibleItems = useMemo(() => navItems.filter((item) => !item.admin || requireRole('admin')), [user?.roles]);

  return (
    <Layout className="app-layout">
      <Layout.Sider className="app-sider" width={232} breakpoint="lg" collapsedWidth={0}>
        <div className="brand-block">
          <div className="brand-mark">CT</div>
          <div>
            <Typography.Title level={4}>CarbonTrack</Typography.Title>
            <span>碳足迹追踪平台</span>
          </div>
        </div>
        <Menu theme="light" mode="inline" selectedKeys={[location.pathname]} items={visibleItems} onClick={(event) => navigate(event.key)} />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="app-header">
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">服务端口 19411 · 前端端口 18411 · API /api</Typography.Text>
            {token ? (
              <Space>
                <Typography.Text>{user?.username}</Typography.Text>
                <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
              </Space>
            ) : (
              <Button type="primary" onClick={() => setLoginOpen(true)}>登录 demo</Button>
            )}
          </Space>
        </Layout.Header>
        <Layout.Content className="app-content">
          <GlobalErrorBoundary>
            <Outlet />
          </GlobalErrorBoundary>
        </Layout.Content>
      </Layout>
      <Modal title="登录 CarbonTrack" open={loginOpen} onCancel={() => setLoginOpen(false)} footer={null}>
        <Form
          layout="vertical"
          initialValues={{ email: 'demo@carbontrack.local', password: 'password123' }}
          onFinish={async (values) => {
            await login(values);
            setLoginOpen(false);
          }}
        >
          <Form.Item name="email" label="邮箱" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password /></Form.Item>
          <Button type="primary" htmlType="submit" block>登录</Button>
        </Form>
      </Modal>
    </Layout>
  );
}

