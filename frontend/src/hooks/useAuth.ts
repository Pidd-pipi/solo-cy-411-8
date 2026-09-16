import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  return { token, user, isAuthenticated: Boolean(token), logout };
}

