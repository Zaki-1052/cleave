// frontend/src/components/layout/NotificationPanel.tsx — bell trigger + notification
// popover. Radix Popover supplies dismissal, focus management and Escape handling; the
// ember badge is the unread signal.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, UserPlus, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotifications';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { Notification } from '@/api/types';

function NotificationIcon({ type }: { type: string }) {
  if (type === 'project_invitation') {
    return <UserPlus className="h-5 w-5 text-primary" />;
  }
  if (type === 'job_complete') {
    return <CheckCircle className="h-5 w-5 text-success" />;
  }
  if (type === 'job_error') {
    return <XCircle className="h-5 w-5 text-destructive" />;
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
      className={cn(
        'flex w-full gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60',
        !notification.isRead && 'bg-accent/40',
      )}
    >
      <div className="mt-0.5 flex-shrink-0">
        <NotificationIcon type={notification.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{notification.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground/80">
          {formatDateTime(notification.createdAt)}
        </p>
      </div>
      {!notification.isRead && (
        <div className="mt-2 flex-shrink-0">
          <span className="inline-block h-2 w-2 rounded-full bg-ember" />
        </div>
      )}
    </button>
  );
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications();
  const unreadCount = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    if (notification.linkTarget) {
      navigate(notification.linkTarget);
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 font-mono text-[10px] font-semibold text-ember-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}

          {!isLoading && (!notifications || notifications.length === 0) && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Bell className="mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          )}

          {notifications && notifications.length > 0 && (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={handleNotificationClick}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
