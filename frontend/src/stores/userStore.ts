import { create } from 'zustand';
import { getMe, updateProfile } from '../api/user';
import { AuthUser } from '../types/auth';

interface UserStore {
  profile: AuthUser | null;
  loading: boolean;
  loadProfile: () => Promise<void>;
  saveProfile: (payload: Partial<AuthUser>) => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  loading: false,
  async loadProfile() {
    set({ loading: true });
    const result = await getMe();
    set({ profile: result.user, loading: false });
  },
  async saveProfile(payload) {
    set({ loading: true });
    const result = await updateProfile(payload);
    set({ profile: result.user, loading: false });
  }
}));

