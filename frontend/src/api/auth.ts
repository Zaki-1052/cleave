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

export async function logout(): Promise<void> {
  await client.post('/auth/logout');
}

export async function updateMe(updates: {
  firstName?: string;
  lastName?: string;
  emailNotifications?: string;
}): Promise<User> {
  const { data } = await client.patch<User>('/users/me', updates);
  return data;
}

export async function forgotPassword(email: string): Promise<void> {
  await client.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await client.post('/auth/reset-password', { token, password });
}
