// frontend/src/components/docs/DocsPageRenderer.tsx
import type { DocsPageData } from '@/lib/docs-content';
import { DocTable } from './DocTable';
import { DocCallout } from './DocCallout';
import { DocStepList } from './DocStepList';
import { DocCodeBlock } from './DocCodeBlock';
import { Separator } from '@/components/ui/separator';

interface DocsPageRendererProps {
  data: DocsPageData;
}

export function DocsPageRenderer({ data }: DocsPageRendererProps) {
  return (
    <article className="prose-docs">
      <h1 className="font-display text-2xl font-bold text-foreground">{data.title}</h1>
      {data.description && (
        <p className="mt-2 text-muted-foreground">{data.description}</p>
      )}
      <div className="mt-6 space-y-0">
        {data.blocks.map((block, i) => {
          switch (block.type) {
            case 'heading': {
              const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
              const sizes = {
                2: 'text-xl font-bold mt-8 mb-3',
                3: 'text-lg font-semibold mt-6 mb-2',
                4: 'text-base font-semibold mt-4 mb-2',
              };
              return (
                <Tag key={i} id={block.id} className={`font-display text-foreground ${sizes[block.level]}`}>
                  {block.text}
                </Tag>
              );
            }
            case 'paragraph':
              return (
                <p
                  key={i}
                  className="my-2 text-sm leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: block.text }}
                />
              );
            case 'table':
              return <DocTable key={i} headers={block.headers} rows={block.rows} />;
            case 'list':
              if (block.ordered) {
                return (
                  <ol key={i} className="my-3 list-decimal space-y-1 pl-6 text-sm text-muted-foreground">
                    {block.items.map((item, j) => (
                      <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                    ))}
                  </ol>
                );
              }
              return (
                <ul key={i} className="my-3 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
                  {block.items.map((item, j) => (
                    <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </ul>
              );
            case 'steps':
              return <DocStepList key={i} items={block.items} />;
            case 'callout':
              return <DocCallout key={i} variant={block.variant} text={block.text} />;
            case 'code':
              return <DocCodeBlock key={i} content={block.content} language={block.language} />;
            case 'separator':
              return <Separator key={i} className="my-6" />;
            default:
              return null;
          }
        })}
      </div>
    </article>
  );
}
