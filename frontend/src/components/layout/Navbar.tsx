// frontend/src/components/layout/Navbar.tsx — instrument toolbar: serif wordmark, one
// link treatment (viridian underline marks the active route), quiet icon row. Collapses
// the center links into a menu below md.
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, ChevronDown, Home, ListTodo, LogOut, Menu, Settings, Shield } from 'lucide-react';
import { CleaveIcon } from '@/components/ui/CleaveIcon';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationPanel } from './NotificationPanel';
import { cn } from '@/lib/cn';

const ICON_BUTTON =
  'rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex h-14 items-center gap-1.5 border-b-2 px-1 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-8">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CleaveIcon size={18} />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">Cleave</span>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          <NavLink to="/dashboard" active={pathname === '/dashboard'}>
            Home
          </NavLink>
          <NavLink to="/queue" active={pathname === '/queue'}>
            Analysis Queue
          </NavLink>
          {user?.isSuperuser && (
            <NavLink to="/admin" active={pathname === '/admin'}>
              <Shield className="h-3.5 w-3.5" />
              Admin
            </NavLink>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <NotificationPanel />

        <Link to="/docs" className={ICON_BUTTON} aria-label="Documentation">
          <BookOpen className="h-5 w-5" />
        </Link>

        <a
          href="https://github.com/Zaki-1052/cleave"
          target="_blank"
          rel="noopener noreferrer"
          className={ICON_BUTTON}
          aria-label="GitHub Repository"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>

        <ThemeToggle />

        {/* Collapsed nav for narrow viewports */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={ICON_BUTTON} aria-label="Navigation menu">
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/dashboard">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/queue">
                  <ListTodo className="h-4 w-4" />
                  Analysis Queue
                </Link>
              </DropdownMenuItem>
              {user?.isSuperuser && (
                <DropdownMenuItem asChild>
                  <Link to="/admin">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex">
                {user.firstName ?? user.email}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
