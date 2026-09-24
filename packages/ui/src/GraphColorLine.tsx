export interface GraphColorLineProps {
  /** The Graph's resolved colour — the caller resolves it through `graphColor`. */
  readonly color: string;
}

/**
 * A short line in a Graph's colour: the mark that says which colour a Graph's
 * Edges are drawn in, beside that Graph's title.
 *
 * **One mark for every surface that keys a Graph by colour** — the canvas HUD's
 * Graph key and the rows of each list offering a choice of Graph (the Command
 * Dock's and an Open Space Resource's). A line rather than a glyph because a
 * line is what a Graph's colour means on the canvas: it is how its Edges are
 * drawn. The surfaces that name what *kind* of entity a colour belongs to — the
 * Dock's Graph identity, the Colour… command — keep the coloured `GraphIcon`.
 *
 * It takes a resolved colour rather than resolving one, so the one rule for a
 * Graph's displayed colour stays in `graphColor` and every caller reaches it
 * there. Decorative: the title beside it names the Graph.
 */
export function GraphColorLine({ color }: GraphColorLineProps) {
  return (
    <span
      data-slot="graph-color-line"
      aria-hidden="true"
      className="h-[3px] w-[14px] shrink-0 rounded-chrome-2xs"
      style={{ background: color }}
    />
  );
}
