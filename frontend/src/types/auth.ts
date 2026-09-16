export interface AuthUser {
  id: number;
  email: string;
  username: string;
  avatar?: string | null;
  region: string;
  roles: string[];
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

