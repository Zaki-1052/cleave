// frontend/src/components/layout/NotificationPanel.tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, UserPlus, XCircle } from 'lucide-react';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotifications';
import { formatDateTime } from '@/lib/utils';
import type { Notification } from '@/api/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationIcon({ type }: { type: string }) {
  if (type === 'project_invitation') {
    return <UserPlus className="h-5 w-5 text-primary" />;
  }
  if (type === 'job_complete') {
    return <CheckCircle className="h-5 w-5 text-status-complete" />;
  }
  if (type === 'job_error') {
    return <XCircle className="h-5 w-5 text-status-error" />;
  }
  // Default (welcome, etc.)
  return <Bell className="h-5 w-5 text-primary" />;
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: (n: Notification) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
        !notification.isRead ? 'bg-primary/5' : ''
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">
        <NotificationIcon type={notification.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
        <p className="mt-0.5 text-sm text-gray-600">{notification.message}</p>
        <p className="mt-1 text-xs text-gray-400">{formatDateTime(notification.createdAt)}</p>
      </div>
      {!notification.isRead && (
        <div className="mt-2 flex-shrink-0">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
    </button>
  );
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications();
  const unreadCount = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    if (notification.linkTarget) {
      navigate(notification.linkTarget);
    }
    onClose();
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isLoading && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Loading...</p>
        )}

        {!isLoading && (!notifications || notifications.length === 0) && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</p>
        )}

        {notifications && notifications.length > 0 && (
          <>
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={handleNotificationClick}
                />
              ))}
            </div>
            <p className="border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
              No more recent notifications to show
            </p>
          </>
        )}
      </div>
    </div>
  );
}
