// frontend/src/api/notifications.ts
import client from './client';
import type { Notification } from './types';

export async function getNotifications(): Promise<Notification[]> {
  const { data } = await client.get<Notification[]>('/notifications');
  return data;
}

export async function markRead(notificationId: number): Promise<void> {
  await client.patch(`/notifications/${notificationId}/read`);
}

export async function markAllRead(): Promise<void> {
  await client.patch('/notifications/read-all');
}
