// frontend/src/components/layout/Navbar.tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';

export function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const unreadCount = useUnreadCount();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  function toggleNotifications() {
    setNotifOpen((prev) => !prev);
    setUserMenuOpen(false);
  }

  function toggleUserMenu() {
    setUserMenuOpen((prev) => !prev);
    setNotifOpen(false);
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between bg-white px-6 py-3 shadow-sm">
      <div className="flex items-center gap-8">
        <Link to="/" className="text-xl font-bold text-primary">
          Cleave
        </Link>
        <div className="flex gap-6">
          <Link
            to="/"
            className={`text-sm font-medium ${
              pathname === '/' ? 'border-b-2 border-primary text-primary' : 'text-gray-600 hover:text-primary'
            }`}
          >
            Home
          </Link>
          <Link
            to="/queue"
            className={`text-sm font-medium ${
              pathname === '/queue'
                ? 'border-b-2 border-status-complete text-status-complete'
                : 'text-gray-600 hover:text-primary'
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
            className="text-gray-500 hover:text-primary"
            aria-label="Notifications"
            onClick={toggleNotifications}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        {/* User menu dropdown */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={toggleUserMenu}
              className="text-sm text-gray-700 hover:text-primary"
            >
              {user.firstName ?? user.email} ▼
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                <Link
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Settings
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
