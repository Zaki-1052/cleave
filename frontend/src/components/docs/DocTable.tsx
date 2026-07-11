// frontend/src/components/docs/DocTable.tsx

interface DocTableProps {
  headers: string[];
  rows: string[][];
}

export function DocTable({ headers, rows }: DocTableProps) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border last:border-0">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-2.5 text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: cell }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
