// frontend/src/components/docs/DocCodeBlock.tsx

interface DocCodeBlockProps {
  content: string;
  language?: string;
}

export function DocCodeBlock({ content }: DocCodeBlockProps) {
  return (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm text-foreground">
      <code>{content}</code>
    </pre>
  );
}
