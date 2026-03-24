// frontend/src/api/client.ts
import axios from 'axios';
import type { ApiError } from './types';

const client = axios.create({
  baseURL: '/api/v1',
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.response) {
      return Promise.reject({ error: 'Network error', detail: null, fieldErrors: null } satisfies ApiError);
    }

    const { status, data } = error.response;

    if (status === 401 && accessToken) {
      // Attempt token refresh once
      try {
        const refreshRes = await axios.post('/api/v1/auth/refresh', {
          refreshToken: null, // cookie-based
        });
        const newToken = refreshRes.data.accessToken as string;
        setAccessToken(newToken);
        if (error.config) {
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return client.request(error.config);
        }
      } catch {
        setAccessToken(null);
      }
    }

    const apiError: ApiError = {
      error: data?.error ?? error.message,
      detail: data?.detail ?? null,
      fieldErrors: data?.fieldErrors ?? null,
    };
    return Promise.reject(apiError);
  },
);

export default client;
