// frontend/src/components/layout/Navbar.tsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, BookOpen, ChevronDown, Settings, LogOut, Shield } from 'lucide-react';
import { CleaveIcon } from '@/components/ui/CleaveIcon';
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
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-8">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-xl font-bold text-primary">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent-teal">
            <CleaveIcon size={18} />
          </div>
          Cleave
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/dashboard"
            className={`text-[15px] font-semibold transition-colors ${
              pathname === '/dashboard'
                ? 'border-b-2 border-primary text-primary'
                : 'text-foreground/70 hover:text-primary'
            }`}
          >
            Home
          </Link>
          <Link
            to="/queue"
            className={`text-[15px] font-semibold transition-colors ${
              pathname === '/queue'
                ? 'border-b-2 border-status-complete text-status-complete'
                : 'text-foreground/70 hover:text-primary'
            }`}
          >
            Analysis Queue
          </Link>
          {user?.isSuperuser && (
            <Link
              to="/admin"
              className={`flex items-center gap-1 text-[15px] font-semibold transition-colors ${
                pathname === '/admin'
                  ? 'border-b-2 border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'text-foreground/70 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Notification bell + dropdown */}
        <div className="relative flex items-center">
          <button
            className="rounded-md p-2 text-foreground/60 transition-colors hover:text-primary"
            aria-label="Notifications"
            onClick={toggleNotifications}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        {/* Docs link */}
        <Link
          to="/docs"
          className="rounded-md p-2 text-foreground/60 transition-colors hover:text-primary"
          aria-label="Documentation"
        >
          <BookOpen className="h-5 w-5" />
        </Link>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu dropdown */}
        {user && (
          <DropdownMenu onOpenChange={(open) => { if (open) setNotifOpen(false); }}>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[15px] font-medium text-foreground/80 transition-colors hover:text-primary">
                {user.firstName ?? user.email}
                <ChevronDown className="h-4 w-4" />
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
