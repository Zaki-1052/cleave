// frontend/src/hooks/useNotifications.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as notificationsApi from '@/api/notifications';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getNotifications(),
  });
}

export function useUnreadCount() {
  const { data: notifications } = useNotifications();
  return notifications?.filter((n) => !n.isRead).length ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => notificationsApi.markRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
