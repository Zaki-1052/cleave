// frontend/src/components/layout/Navbar.tsx
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

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
        <button className="text-gray-500 hover:text-primary" aria-label="Notifications">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
        {user && (
          <div className="relative">
            <button
              onClick={logout}
              className="text-sm text-gray-700 hover:text-primary"
            >
              {user.firstName ?? user.email} ▼
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
