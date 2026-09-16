export interface AuthUser {
  id: number;
  email: string;
  username: string;
  region: string;
  roles: string[];
}

export interface JwtPayload {
  sub: number;
  email: string;
  username: string;
  region: string;
  roles: string[];
}

