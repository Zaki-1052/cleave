// frontend/src/api/auth.ts
import client from './client';
import type { TokenResponse, User } from './types';

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/auth/login', { email, password });
  return data;
}

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/auth/register', {
    email,
    password,
    firstName,
    lastName,
  });
  return data;
}

export async function refresh(): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/auth/refresh', {});
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await client.get<User>('/users/me');
  return data;
}
