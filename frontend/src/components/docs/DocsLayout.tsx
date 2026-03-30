// frontend/src/components/docs/DocsLayout.tsx
import { Outlet } from 'react-router-dom';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { DocsNavbar } from './DocsNavbar';
import { DocsSidebar } from './DocsSidebar';
import { Card } from '@/components/layout/Card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function DocsLayout() {
  return (
    <GradientBackground>
      <DocsNavbar />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <Card className="overflow-hidden p-0">
              <ScrollArea className="max-h-[calc(100vh-6rem)]">
                <DocsSidebar />
              </ScrollArea>
            </Card>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </GradientBackground>
  );
}
