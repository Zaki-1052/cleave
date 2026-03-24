// frontend/src/api/client.ts
import axios from 'axios';
import type { ApiError } from './types';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

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

// Refresh queue: prevents concurrent refresh attempts from racing
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
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
    const originalRequest = error.config;

    if (status === 401 && accessToken && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        // Another refresh is in-flight — queue this request
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client.request(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post('/api/v1/auth/refresh', {});
        const newToken = refreshRes.data.accessToken as string;
        setAccessToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client.request(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
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
