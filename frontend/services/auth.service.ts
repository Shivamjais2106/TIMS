import { api } from '@/lib/api';
import type { AuthResult, Role, User } from '@/types';

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
  role?: Extract<Role, 'ANALYST' | 'VIEWER'>;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authService = {
  signup: (payload: SignupPayload) => api.post<AuthResult>('/auth/signup', payload, { auth: false }),
  login: (payload: LoginPayload) => api.post<AuthResult>('/auth/login', payload, { auth: false }),
  me: () => api.get<{ user: User }>('/auth/me'),
  logout: () => api.post<{ message: string }>('/auth/logout'),
};
