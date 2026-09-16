import { Button, ButtonProps, Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';

interface Props extends ButtonProps {
  role: string;
}

export function PermissionButton({ role, children, ...props }: Props) {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles?.includes(role));
  if (!allowed) {
    return (
      <Tooltip title={`需要 ${role} 权限`}>
        <Button icon={<LockOutlined />} disabled {...props}>{children}</Button>
      </Tooltip>
    );
  }
  return <Button {...props}>{children}</Button>;
}

