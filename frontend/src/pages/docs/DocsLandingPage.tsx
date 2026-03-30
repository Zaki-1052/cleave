// frontend/src/pages/docs/DocsLandingPage.tsx
import { Link } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { DOCS_NAV } from '@/lib/docs-navigation';
import { DOCS_CONTENT } from '@/lib/docs-content';

export default function DocsLandingPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">Documentation</h1>
      <p className="mt-2 text-muted-foreground">
        Platform documentation, pipeline reference, QC interpretation, and step-by-step tutorials
        for the Ferguson Lab&apos;s CUT&amp;RUN/CUT&amp;Tag analysis platform.
      </p>

      <div className="mt-8 space-y-8">
        {DOCS_NAV.map((group) => (
          <section key={group.group}>
            <h2 className="mb-3 font-display text-lg font-semibold text-foreground">{group.group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => {
                const content = DOCS_CONTENT[item.slug];
                return (
                  <Link key={item.slug} to={`/docs/${item.slug}`}>
                    <Card variant="interactive" className="h-full p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                          {content && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {content.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
