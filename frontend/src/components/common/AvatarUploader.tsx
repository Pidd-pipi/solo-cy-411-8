import { Avatar, Button, Input, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

interface Props {
  value?: string | null;
  username?: string;
  onChange: (url: string) => void;
}

export function AvatarUploader({ value, username, onChange }: Props) {
  return (
    <Space>
      <Avatar size={56} src={value || undefined}>{username?.slice(0, 1).toUpperCase()}</Avatar>
      <Input placeholder="头像 URL" value={value || ''} onChange={(event) => onChange(event.target.value)} style={{ width: 260 }} />
      <Button icon={<UploadOutlined />} onClick={() => onChange(value || '')}>应用</Button>
    </Space>
  );
}
