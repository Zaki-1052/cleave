// frontend/src/components/layout/NotificationPanel.tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import { formatDateTime } from '@/lib/utils';
import type { Notification } from '@/api/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationIcon({ type }: { type: string }) {
  if (type === 'project_invitation') {
    return (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  }
  if (type === 'job_complete') {
    return (
      <svg className="h-5 w-5 text-status-complete" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (type === 'job_error') {
    return (
      <svg className="h-5 w-5 text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  // Default (welcome, etc.)
  return (
    <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
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
  const markRead = useMarkNotificationRead();

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
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
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
