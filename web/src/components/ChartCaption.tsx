/**
 * The explanatory lines shown above a chart — one <p> per paragraph, styled by `.chart-caption`.
 *
 * Mirrors how the exported HTML renders a chart's caption (see `htmlExport.ts`), so the app and
 * the downloaded file read the same. Each figure carries its own `caption` array, built in its
 * visualization module, so this component just lays it out.
 */
export function ChartCaption({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        // Keyed by position, not text: the lines are a fixed, ordered list, and two
        // translations that happen to come out identical would collide on a text key.
        <p key={i} className="chart-caption">
          {line}
        </p>
      ))}
    </>
  )
}
