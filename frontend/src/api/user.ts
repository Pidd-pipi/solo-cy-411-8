import { request } from '../utils/request';
import { AuthUser } from '../types/auth';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  username: string;
  region: string;
}

export function login(payload: LoginPayload): Promise<{ token: string; user: AuthUser }> {
  return request.post('/users/login', payload);
}

export function register(payload: RegisterPayload): Promise<{ user: AuthUser }> {
  return request.post('/users/register', payload);
}

export function getMe(): Promise<{ user: AuthUser }> {
  return request.get('/users/me');
}

export function updateProfile(payload: Partial<AuthUser>): Promise<{ user: AuthUser }> {
  return request.patch('/users/me', payload);
}

