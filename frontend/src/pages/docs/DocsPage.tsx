// frontend/src/pages/docs/DocsPage.tsx
import { useParams, Link } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { DOCS_CONTENT } from '@/lib/docs-content';
import { DocsPageRenderer } from '@/components/docs/DocsPageRenderer';
import { DocPrevNext } from '@/components/docs/DocPrevNext';

export default function DocsPage() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug || !DOCS_CONTENT[slug]) {
    return (
      <Card>
        <h1 className="font-display text-xl font-bold text-foreground">Page Not Found</h1>
        <p className="mt-2 text-muted-foreground">
          The documentation page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link to="/docs" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Back to Documentation
        </Link>
      </Card>
    );
  }

  const content = DOCS_CONTENT[slug];

  return (
    <Card>
      <DocsPageRenderer data={content} />
      <DocPrevNext slug={slug} />
    </Card>
  );
}
