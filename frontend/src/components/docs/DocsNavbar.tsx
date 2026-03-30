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
            className="rounded-md p-2 text-foreground/60 transition-colors hover:text-primary lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold text-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent-teal">
              <CleaveIcon size={18} />
            </div>
            Cleave
          </Link>
          <span className="hidden text-sm font-medium text-muted-foreground sm:inline">Documentation</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/dashboard"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Launch Dashboard
          </Link>
        </div>
      </nav>
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-14 bottom-0 w-64 overflow-y-auto border-r border-border bg-card">
            <DocsSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
