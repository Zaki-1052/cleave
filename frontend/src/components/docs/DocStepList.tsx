// frontend/src/components/docs/DocStepList.tsx

interface DocStepListProps {
  items: { title: string; description: string }[];
}

export function DocStepList({ items }: DocStepListProps) {
  return (
    <ol className="my-4 space-y-3 pl-0">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {i + 1}
          </span>
          <div>
            <span className="font-semibold text-foreground">{step.title}</span>
            {step.description && (
              <span
                className="text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: ` — ${step.description}` }}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
