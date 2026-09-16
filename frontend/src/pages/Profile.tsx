import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { AvatarUploader } from '../components/common/AvatarUploader';
import { useUserStore } from '../stores/userStore';
import { Messages } from '../constants/messages';
import { useAuth } from '../hooks/useAuth';

export function Profile() {
  const profile = useUserStore((state) => state.profile);
  const loadProfile = useUserStore((state) => state.loadProfile);
  const saveProfile = useUserStore((state) => state.saveProfile);
  const [avatar, setAvatar] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void loadProfile();
  }, [loadProfile, token]);

  useEffect(() => {
    setAvatar(profile?.avatar || '');
  }, [profile?.avatar]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>个人中心</Typography.Title>
        <Typography.Text type="secondary">修改头像、昵称和地区。</Typography.Text>
      </div>
      <Card>
        <Form
          layout="vertical"
          initialValues={profile || undefined}
          key={profile?.id || 'profile'}
          onFinish={async (values) => {
            await saveProfile({ ...values, avatar });
            message.success(Messages.FRONTEND_PROFILE_SAVED);
          }}
        >
          <Form.Item label="头像">
            <AvatarUploader value={avatar} username={profile?.username} onChange={setAvatar} />
          </Form.Item>
          <Form.Item name="username" label="昵称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input disabled /></Form.Item>
          <Form.Item name="region" label="地区" rules={[{ required: true }]}><Input /></Form.Item>
          <Button type="primary" htmlType="submit">保存资料</Button>
        </Form>
      </Card>
    </Space>
  );
}
