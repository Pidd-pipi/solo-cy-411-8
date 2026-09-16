import { NavigateFunction } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function requireAuth(navigate: NavigateFunction) {
  const token = useAuthStore.getState().token;
  if (!token) {
    navigate('/dashboard', { replace: true });
    return false;
  }
  return true;
}

export function requireRole(role: string) {
  const roles = useAuthStore.getState().user?.roles || [];
  return roles.includes(role);
}
