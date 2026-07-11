// frontend/src/components/docs/DocsNavbar.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { CleaveIcon } from '@/components/ui/CleaveIcon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DocsSidebar } from './DocsSidebar';

export function DocsNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-4">
          <button
            className="rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CleaveIcon size={18} />
            </div>
            <span className="font-display text-lg font-semibold text-foreground">Cleave</span>
          </Link>
          <span className="hidden font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:inline">
            Documentation
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/dashboard"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Launch Dashboard
          </Link>
        </div>
      </nav>
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-overlay/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-14 bottom-0 w-64 overflow-y-auto border-r border-border bg-card">
            <DocsSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
