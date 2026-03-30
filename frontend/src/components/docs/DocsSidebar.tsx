// frontend/src/components/docs/DocsSidebar.tsx
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { DOCS_NAV } from '@/lib/docs-navigation';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

interface DocsSidebarProps {
  onNavigate?: () => void;
}

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const { pathname } = useLocation();

  return (
    <nav className="space-y-1 py-2">
      {DOCS_NAV.map((group) => (
        <Collapsible key={group.group} defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            {group.group}
            <ChevronDown className="h-3 w-3 transition-transform [[data-state=closed]>&]:rotate-[-90deg]" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {group.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={item.slug}
                  to={href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-all duration-150 ${
                    isActive
                      ? 'border-l-2 border-primary bg-primary/5 dark:bg-primary/10 font-semibold text-primary'
                      : 'border-l-2 border-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </nav>
  );
}
