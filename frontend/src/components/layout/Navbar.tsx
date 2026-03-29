// frontend/src/components/layout/Navbar.tsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, Settings, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationPanel } from './NotificationPanel';

export function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const unreadCount = useUnreadCount();
  const [notifOpen, setNotifOpen] = useState(false);

  function toggleNotifications() {
    setNotifOpen((prev) => !prev);
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-8">
        <Link to="/" className="font-display text-xl font-bold text-primary">
          Cleave
        </Link>
        <div className="flex gap-6">
          <Link
            to="/"
            className={`text-sm font-medium ${
              pathname === '/' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            Home
          </Link>
          <Link
            to="/queue"
            className={`text-sm font-medium ${
              pathname === '/queue'
                ? 'border-b-2 border-status-complete text-status-complete'
                : 'text-muted-foreground hover:text-primary'
            }`}
          >
            Analysis Queue
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* Notification bell + dropdown */}
        <div className="relative">
          <button
            className="text-muted-foreground hover:text-primary"
            aria-label="Notifications"
            onClick={toggleNotifications}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu dropdown */}
        {user && (
          <DropdownMenu onOpenChange={(open) => { if (open) setNotifOpen(false); }}>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1 text-sm text-foreground hover:text-primary">
                {user.firstName ?? user.email}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
}
