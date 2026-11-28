import type { ReactNode } from "react";
export function AnalyticsTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <section
      aria-label={caption}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this named table region.
      tabIndex={0}
      className="max-h-[32rem] overflow-auto rounded-xl border focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="p-3 text-left font-medium">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap border-b p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, i) =>
                  i === 0 ? (
                    <th
                      key={headers[i]}
                      scope="row"
                      className="sticky left-0 min-w-28 max-w-64 break-words border-b bg-card p-3 text-left font-medium"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={headers[i]} className="whitespace-nowrap border-b p-3">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="p-6 text-muted-foreground">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
