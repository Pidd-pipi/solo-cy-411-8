import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as loginApi, LoginPayload } from '../api/user';
import { AuthState } from '../types/auth';

interface AuthStore extends AuthState {
  login: (payload: LoginPayload) => Promise<void>;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      async login(payload) {
        const result = await loginApi(payload);
        set({ token: result.token, user: result.user });
      },
      setToken(token) {
        set({ token });
      },
      logout() {
        set({ token: null, user: null });
      }
    }),
    { name: 'carbontrack-auth' }
  )
);

