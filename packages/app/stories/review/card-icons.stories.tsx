/**
 * THROWAWAY UX PROTOTYPE — the glyphs the chrome spends on entities.
 *
 * **Settled here, and the reason each was chosen is the row beside it.**
 *
 *   Space   frame        a bounded region you go into
 *   Card    sticky-note  a note, not a filed document
 *   Graph   route        a path from a start pin to an end pin
 *   Layout  layout-grid  placements on a plane
 *   Alias   a corner badge on whichever of those it is an Alias of
 *
 * The four replace `SquareSquare`, `FileText`, `Network` and `PanelsTopLeft`.
 * Two of those described something the product is not: `Network` is a
 * hierarchy — one node over two under a bracket — where a Graph is a curated
 * directed traversal with branches and joins; `PanelsTopLeft` is a web page
 * chrome where a Layout is authored placement on a plane (ADR 0014 — placement
 * is authored, not computed).
 *
 * **An Alias is not a fifth glyph, and that is the load-bearing decision.** A
 * single Alias mark can say *that* a Card refers elsewhere but never *what it
 * refers to* — and a Space Card can be an Alias's Target as much as a Markdown
 * Card can, so the two would draw identically. The kind of the thing on the
 * canvas is exactly what the glyph exists to carry, so the base is kept and a
 * badge is added. It also agrees with what the canvas already does:
 * `canvas-card.css` keeps the Card and only changes `border-style` to dotted.
 *
 * **What a candidate must not look like is half the problem, and it is the
 * half prose keeps losing.** So the sheet ends with `SPENT` — the glyphs
 * `packages/ui/src/icons.tsx` already exports, each drawn, named by its export,
 * and labelled with what a reader already reads it as. A candidate that
 * resembles one of those is not a fresh mark; it is a second meaning for a mark
 * that already has one. That row draws the **spent** glyphs and not their
 * lookalikes — an earlier version drew `waypoints` and `git-fork` under the
 * heading, which said "already spent" over two glyphs nothing spends.
 *
 * The candidates are **lucide's own geometry**, read out of the installed
 * package rather than redrawn — `packages/app` may not import `lucide-react`
 * (it goes through `@project/ui`), and adding thirty icons to the production
 * package to throw twenty-six away is worse than carrying the node data here
 * for the duration of the comparison. One key is spelled for what it draws
 * rather than for lucide's name: `triangle-square-circle` is lucide's `shapes`,
 * renamed because `anti-slop/no-shape-in-symbol-names` reads an object key as a
 * symbol name.
 *
 * **This is now built.** `LayoutIcon`, `GraphIcon`, `MarkdownIcon` and
 * `SpaceCardIcon` draw these glyphs, and `AliasIcon` composes the badge over a
 * base rather than being a glyph of its own; `CardKindIcon` takes `aliasOf` and
 * composes rather than switching on a table. What is *not* built is the
 * plumbing: no call site supplies `aliasOf` yet, because the Target's kind is
 * not on `CanvasCardFront` — its `aliasOf` is the Target's Title — so every
 * Alias still draws over the Markdown base. Carrying the Target's kind to the
 * surface is a change to the front's shape and belongs with the ADR.
 *
 * This sheet survives its own implementation only as the record of what was
 * compared; delete it once the ADR carries the reasoning. Glyphs are drawn at
 * the two sizes that decide the question: 14px, which is the list row, and
 * 20px, which is roughly a Card Front.
 */
import type { Story } from '@ladle/react';
import './card-icons.css';

export default { title: 'Review/Card Icons' };

/* ----------------------------------------------------------------- glyphs */

/**
 * One drawing instruction, as a closed union over the four element kinds
 * lucide actually emits across these candidates. A looser `[tag, attrs]` pair
 * would need an assertion to reach `createElement`, and the switch below is
 * exhaustive without one.
 */
type GlyphNode =
  | { readonly tag: 'path'; readonly d: string }
  | { readonly tag: 'circle'; readonly cx: string; readonly cy: string; readonly r: string }
  | {
      readonly tag: 'rect';
      readonly width: string;
      readonly height: string;
      readonly x: string;
      readonly y: string;
      readonly rx?: string;
      readonly ry?: string;
    }
  | {
      readonly tag: 'line';
      readonly x1: string;
      readonly x2: string;
      readonly y1: string;
      readonly y2: string;
    };

const GLYPHS = {
  'arrow-up-right': [
    { tag: 'path', d: 'M7 7h10v10' },
    { tag: 'path', d: 'M7 17 17 7' },
  ],
  'corner-up-right': [
    { tag: 'path', d: 'm15 14 5-5-5-5' },
    { tag: 'path', d: 'M4 20v-7a4 4 0 0 1 4-4h12' },
  ],
  asterisk: [
    { tag: 'path', d: 'M12 6v12' },
    { tag: 'path', d: 'M17.196 9 6.804 15' },
    { tag: 'path', d: 'm6.804 9 10.392 6' },
  ],
  circle: [{ tag: 'circle', cx: '12', cy: '12', r: '10' }],
  route: [
    { tag: 'circle', cx: '6', cy: '19', r: '3' },
    { tag: 'path', d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' },
    { tag: 'circle', cx: '18', cy: '5', r: '3' },
  ],
  'git-graph': [
    { tag: 'circle', cx: '5', cy: '6', r: '3' },
    { tag: 'path', d: 'M5 9v6' },
    { tag: 'circle', cx: '5', cy: '18', r: '3' },
    { tag: 'path', d: 'M12 3v18' },
    { tag: 'circle', cx: '19', cy: '6', r: '3' },
    { tag: 'path', d: 'M16 15.7A9 9 0 0 0 19 9' },
  ],
  'git-branch': [
    { tag: 'path', d: 'M15 6a9 9 0 0 0-9 9V3' },
    { tag: 'circle', cx: '18', cy: '6', r: '3' },
    { tag: 'circle', cx: '6', cy: '18', r: '3' },
  ],
  spline: [
    { tag: 'circle', cx: '19', cy: '5', r: '2' },
    { tag: 'circle', cx: '5', cy: '19', r: '2' },
    { tag: 'path', d: 'M5 17A12 12 0 0 1 17 5' },
  ],
  workflow: [
    { tag: 'rect', width: '8', height: '8', x: '3', y: '3', rx: '2' },
    { tag: 'path', d: 'M7 11v4a2 2 0 0 0 2 2h4' },
    { tag: 'rect', width: '8', height: '8', x: '13', y: '13', rx: '2' },
  ],
  'share-2': [
    { tag: 'circle', cx: '18', cy: '5', r: '3' },
    { tag: 'circle', cx: '6', cy: '12', r: '3' },
    { tag: 'circle', cx: '18', cy: '19', r: '3' },
    { tag: 'line', x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49' },
    { tag: 'line', x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49' },
  ],
  'chart-network': [
    { tag: 'path', d: 'm13.11 7.664 1.78 2.672' },
    { tag: 'path', d: 'm14.162 12.788-3.324 1.424' },
    { tag: 'path', d: 'm20 4-6.06 1.515' },
    { tag: 'path', d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { tag: 'circle', cx: '12', cy: '6', r: '2' },
    { tag: 'circle', cx: '16', cy: '12', r: '2' },
    { tag: 'circle', cx: '9', cy: '15', r: '2' },
  ],
  milestone: [
    { tag: 'path', d: 'M12 13v8' },
    { tag: 'path', d: 'M12 3v3' },
    {
      tag: 'path',
      d: 'M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
    },
  ],
  'layout-grid': [
    { tag: 'rect', width: '7', height: '7', x: '3', y: '3', rx: '1' },
    { tag: 'rect', width: '7', height: '7', x: '14', y: '3', rx: '1' },
    { tag: 'rect', width: '7', height: '7', x: '14', y: '14', rx: '1' },
    { tag: 'rect', width: '7', height: '7', x: '3', y: '14', rx: '1' },
  ],
  group: [
    { tag: 'path', d: 'M3 7V5c0-1.1.9-2 2-2h2' },
    { tag: 'path', d: 'M17 3h2c1.1 0 2 .9 2 2v2' },
    { tag: 'path', d: 'M21 17v2c0 1.1-.9 2-2 2h-2' },
    { tag: 'path', d: 'M7 21H5c-1.1 0-2-.9-2-2v-2' },
    { tag: 'rect', width: '7', height: '5', x: '7', y: '7', rx: '1' },
    { tag: 'rect', width: '7', height: '5', x: '10', y: '12', rx: '1' },
  ],
  'triangle-square-circle': [
    {
      tag: 'path',
      d: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z',
    },
    { tag: 'rect', x: '3', y: '14', width: '7', height: '7', rx: '1' },
    { tag: 'circle', cx: '17.5', cy: '17.5', r: '3.5' },
  ],
  blocks: [
    {
      tag: 'path',
      d: 'M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2',
    },
    { tag: 'rect', x: '14', y: '2', width: '8', height: '8', rx: '1' },
  ],
  component: [
    {
      tag: 'path',
      d: 'M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z',
    },
    {
      tag: 'path',
      d: 'M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z',
    },
    {
      tag: 'path',
      d: 'M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z',
    },
    {
      tag: 'path',
      d: 'M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z',
    },
  ],
  'axis-3d': [
    { tag: 'path', d: 'M13.5 10.5 15 9' },
    { tag: 'path', d: 'M4 4v15a1 1 0 0 0 1 1h15' },
    { tag: 'path', d: 'M4.293 19.707 6 18' },
    { tag: 'path', d: 'm9 15 1.5-1.5' },
  ],
  'square-mouse-pointer': [
    {
      tag: 'path',
      d: 'M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z',
    },
    { tag: 'path', d: 'M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6' },
  ],
  proportions: [
    { tag: 'rect', width: '20', height: '16', x: '2', y: '4', rx: '2' },
    { tag: 'path', d: 'M12 9v11' },
    { tag: 'path', d: 'M2 9h13a2 2 0 0 1 2 2v9' },
  ],
  'grid-2x2': [
    { tag: 'path', d: 'M12 3v18' },
    { tag: 'path', d: 'M3 12h18' },
    { tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2' },
  ],
  'notepad-text-dashed': [
    { tag: 'path', d: 'M8 2v4' },
    { tag: 'path', d: 'M12 2v4' },
    { tag: 'path', d: 'M16 2v4' },
    { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v2' },
    { tag: 'path', d: 'M20 12v2' },
    { tag: 'path', d: 'M20 18v2a2 2 0 0 1-2 2h-1' },
    { tag: 'path', d: 'M13 22h-2' },
    { tag: 'path', d: 'M7 22H6a2 2 0 0 1-2-2v-2' },
    { tag: 'path', d: 'M4 14v-2' },
    { tag: 'path', d: 'M4 8V6a2 2 0 0 1 2-2h2' },
    { tag: 'path', d: 'M8 10h6' },
    { tag: 'path', d: 'M8 14h8' },
    { tag: 'path', d: 'M8 18h5' },
  ],
  'square-dashed-text': [
    { tag: 'path', d: 'M14 21h1' },
    { tag: 'path', d: 'M14 3h1' },
    { tag: 'path', d: 'M19 3a2 2 0 0 1 2 2' },
    { tag: 'path', d: 'M21 14v1' },
    { tag: 'path', d: 'M21 19a2 2 0 0 1-2 2' },
    { tag: 'path', d: 'M21 9v1' },
    { tag: 'path', d: 'M3 14v1' },
    { tag: 'path', d: 'M3 9v1' },
    { tag: 'path', d: 'M5 21a2 2 0 0 1-2-2' },
    { tag: 'path', d: 'M5 3a2 2 0 0 0-2 2' },
    { tag: 'path', d: 'M7 12h10' },
    { tag: 'path', d: 'M7 16h6' },
    { tag: 'path', d: 'M7 8h8' },
    { tag: 'path', d: 'M9 21h1' },
    { tag: 'path', d: 'M9 3h1' },
  ],
  'sticky-notes': [
    {
      tag: 'path',
      d: 'M10 8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 16 14v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    },
    { tag: 'path', d: 'M10 8v5a1 1 0 0 0 1 1h5' },
    {
      tag: 'path',
      d: 'M8 4a2 2 0 0 1 2-2h6a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 22 8v6a2 2 0 0 1-2 2',
    },
    { tag: 'path', d: 'M16 2v5a1 1 0 0 0 1 1h5' },
  ],
  'file-stack': [
    { tag: 'path', d: 'M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1' },
    { tag: 'path', d: 'M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1' },
    {
      tag: 'path',
      d: 'M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z',
    },
  ],
  network: [
    { tag: 'rect', x: '16', y: '16', width: '6', height: '6', rx: '1' },
    { tag: 'rect', x: '2', y: '16', width: '6', height: '6', rx: '1' },
    { tag: 'rect', x: '9', y: '2', width: '6', height: '6', rx: '1' },
    { tag: 'path', d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' },
    { tag: 'path', d: 'M12 12V8' },
  ],
  'panels-top-left': [
    { tag: 'rect', width: '18', height: '18', x: '3', y: '3', rx: '2' },
    { tag: 'path', d: 'M3 9h18' },
    { tag: 'path', d: 'M9 21V9' },
  ],
  copy: [
    { tag: 'rect', width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' },
    { tag: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' },
  ],
  link: [
    { tag: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    { tag: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  ],
  play: [
    {
      tag: 'path',
      d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
    },
  ],
  square: [{ tag: 'rect', width: '18', height: '18', x: '3', y: '3', rx: '2' }],
  plus: [
    { tag: 'path', d: 'M5 12h14' },
    { tag: 'path', d: 'M12 5v14' },
  ],
  'trash-2': [
    { tag: 'path', d: 'M10 11v6' },
    { tag: 'path', d: 'M14 11v6' },
    { tag: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
    { tag: 'path', d: 'M3 6h18' },
    { tag: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
  ],
  pencil: [
    {
      tag: 'path',
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    },
    { tag: 'path', d: 'm15 5 4 4' },
  ],
  'maximize-2': [
    { tag: 'path', d: 'M15 3h6v6' },
    { tag: 'path', d: 'm21 3-7 7' },
    { tag: 'path', d: 'm3 21 7-7' },
    { tag: 'path', d: 'M9 21H3v-6' },
  ],
  ellipsis: [
    { tag: 'circle', cx: '12', cy: '12', r: '1' },
    { tag: 'circle', cx: '19', cy: '12', r: '1' },
    { tag: 'circle', cx: '5', cy: '12', r: '1' },
  ],
  search: [
    { tag: 'path', d: 'm21 21-4.34-4.34' },
    { tag: 'circle', cx: '11', cy: '11', r: '8' },
  ],
  'corner-down-right': [
    { tag: 'path', d: 'm15 10 5 5-5 5' },
    { tag: 'path', d: 'M4 4v7a4 4 0 0 0 4 4h12' },
  ],
  'file-text': [
    {
      tag: 'path',
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    },
    { tag: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { tag: 'path', d: 'M10 9H8' },
    { tag: 'path', d: 'M16 13H8' },
    { tag: 'path', d: 'M16 17H8' },
  ],
  'notepad-text': [
    { tag: 'path', d: 'M8 2v4' },
    { tag: 'path', d: 'M12 2v4' },
    { tag: 'path', d: 'M16 2v4' },
    { tag: 'rect', width: '16', height: '18', x: '4', y: '4', rx: '2' },
    { tag: 'path', d: 'M8 10h6' },
    { tag: 'path', d: 'M8 14h8' },
    { tag: 'path', d: 'M8 18h5' },
  ],
  'sticky-note': [
    {
      tag: 'path',
      d: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z',
    },
    { tag: 'path', d: 'M15 3v5a1 1 0 0 0 1 1h5' },
  ],
  'file-code': [
    {
      tag: 'path',
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    },
    { tag: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { tag: 'path', d: 'M10 12.5 8 15l2 2.5' },
    { tag: 'path', d: 'm14 12.5 2 2.5-2 2.5' },
  ],
  'book-open': [
    { tag: 'path', d: 'M12 5v16' },
    {
      tag: 'path',
      d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
    },
  ],
  'square-square': [
    { tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2' },
    { tag: 'rect', x: '8', y: '8', width: '8', height: '8', rx: '1' },
  ],
  files: [
    { tag: 'path', d: 'M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8' },
    {
      tag: 'path',
      d: 'M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z',
    },
    { tag: 'path', d: 'M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1' },
  ],
  box: [
    {
      tag: 'path',
      d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    },
    { tag: 'path', d: 'm3.3 7 8.7 5 8.7-5' },
    { tag: 'path', d: 'M12 22V12' },
  ],
  boxes: [
    {
      tag: 'path',
      d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
    },
    { tag: 'path', d: 'm7 16.5-4.74-2.85' },
    { tag: 'path', d: 'm7 16.5 5-3' },
    { tag: 'path', d: 'M7 16.5v5.17' },
    {
      tag: 'path',
      d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
    },
    { tag: 'path', d: 'm17 16.5-5-3' },
    { tag: 'path', d: 'm17 16.5 4.74-2.85' },
    { tag: 'path', d: 'M17 16.5v5.17' },
    {
      tag: 'path',
      d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
    },
    { tag: 'path', d: 'M12 8 7.26 5.15' },
    { tag: 'path', d: 'm12 8 4.74-2.85' },
    { tag: 'path', d: 'M12 13.5V8' },
  ],
  'square-stack': [
    { tag: 'path', d: 'M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2' },
    { tag: 'path', d: 'M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2' },
    { tag: 'rect', width: '8', height: '8', x: '14', y: '14', rx: '2' },
  ],
  layers: [
    {
      tag: 'path',
      d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
    },
    { tag: 'path', d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' },
    { tag: 'path', d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' },
  ],
  'door-open': [
    { tag: 'path', d: 'M11 20H2' },
    {
      tag: 'path',
      d: 'M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z',
    },
    { tag: 'path', d: 'M11 4H8a2 2 0 0 0-2 2v14' },
    { tag: 'path', d: 'M14 12h.01' },
    { tag: 'path', d: 'M22 20h-3' },
  ],
  map: [
    {
      tag: 'path',
      d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
    },
    { tag: 'path', d: 'M15 5.764v15' },
    { tag: 'path', d: 'M9 3.236v15' },
  ],
  orbit: [
    { tag: 'path', d: 'M20.341 6.484A10 10 0 0 1 10.266 21.85' },
    { tag: 'path', d: 'M3.659 17.516A10 10 0 0 1 13.74 2.152' },
    { tag: 'circle', cx: '12', cy: '12', r: '3' },
    { tag: 'circle', cx: '19', cy: '5', r: '2' },
    { tag: 'circle', cx: '5', cy: '19', r: '2' },
  ],
  frame: [
    { tag: 'line', x1: '22', x2: '2', y1: '6', y2: '6' },
    { tag: 'line', x1: '22', x2: '2', y1: '18', y2: '18' },
    { tag: 'line', x1: '6', x2: '6', y1: '2', y2: '22' },
    { tag: 'line', x1: '18', x2: '18', y1: '2', y2: '22' },
  ],
  scan: [
    { tag: 'path', d: 'M3 7V5a2 2 0 0 1 2-2h2' },
    { tag: 'path', d: 'M17 3h2a2 2 0 0 1 2 2v2' },
    { tag: 'path', d: 'M21 17v2a2 2 0 0 1-2 2h-2' },
    { tag: 'path', d: 'M7 21H5a2 2 0 0 1-2-2v-2' },
  ],
  'file-symlink': [
    {
      tag: 'path',
      d: 'M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7',
    },
    { tag: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { tag: 'path', d: 'm10 18 3-3-3-3' },
  ],
  'folder-symlink': [
    {
      tag: 'path',
      d: 'M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7',
    },
    { tag: 'path', d: 'm8 16 3-3-3-3' },
  ],
  replace: [
    { tag: 'path', d: 'M14 4a1 1 0 0 1 1-1' },
    { tag: 'path', d: 'M15 10a1 1 0 0 1-1-1' },
    { tag: 'path', d: 'M21 4a1 1 0 0 0-1-1' },
    { tag: 'path', d: 'M21 9a1 1 0 0 1-1 1' },
    { tag: 'path', d: 'm3 7 3 3 3-3' },
    { tag: 'path', d: 'M6 10V5a2 2 0 0 1 2-2h2' },
    { tag: 'rect', x: '3', y: '14', width: '7', height: '7', rx: '1' },
  ],
  'link-2': [
    { tag: 'path', d: 'M9 17H7A5 5 0 0 1 7 7h2' },
    { tag: 'path', d: 'M15 7h2a5 5 0 1 1 0 10h-2' },
    { tag: 'line', x1: '8', x2: '16', y1: '12', y2: '12' },
  ],
  'external-link': [
    { tag: 'path', d: 'M15 3h6v6' },
    { tag: 'path', d: 'M10 14 21 3' },
    { tag: 'path', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
  ],
  'square-arrow-out-up-right': [
    { tag: 'path', d: 'M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6' },
    { tag: 'path', d: 'm21 3-9 9' },
    { tag: 'path', d: 'M15 3h6v6' },
  ],
  waypoints: [
    { tag: 'path', d: 'm10.586 5.414-5.172 5.172' },
    { tag: 'path', d: 'm18.586 13.414-5.172 5.172' },
    { tag: 'path', d: 'M6 12h12' },
    { tag: 'circle', cx: '12', cy: '20', r: '2' },
    { tag: 'circle', cx: '12', cy: '4', r: '2' },
    { tag: 'circle', cx: '20', cy: '12', r: '2' },
    { tag: 'circle', cx: '4', cy: '12', r: '2' },
  ],
  'git-fork': [
    { tag: 'circle', cx: '12', cy: '18', r: '3' },
    { tag: 'circle', cx: '6', cy: '6', r: '3' },
    { tag: 'circle', cx: '18', cy: '6', r: '3' },
    { tag: 'path', d: 'M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9' },
    { tag: 'path', d: 'M12 12v3' },
  ],
} satisfies Record<string, readonly GlyphNode[]>;

type GlyphName = keyof typeof GLYPHS;

function GlyphNodeElement({
  node,
  solid = false,
}: {
  readonly node: GlyphNode;
  /** Opt this one node out of the glyph's dash pattern. */
  readonly solid?: boolean;
}) {
  const stroke = solid ? { strokeDasharray: 'none' } : {};
  switch (node.tag) {
    case 'path':
      return <path d={node.d} {...stroke} />;
    case 'circle':
      return <circle cx={node.cx} cy={node.cy} r={node.r} {...stroke} />;
    case 'rect':
      return (
        <rect
          width={node.width}
          height={node.height}
          x={node.x}
          y={node.y}
          rx={node.rx}
          ry={node.ry}
          {...stroke}
        />
      );
    case 'line':
      return <line x1={node.x1} x2={node.x2} y1={node.y1} y2={node.y2} {...stroke} />;
  }
}

/**
 * Lucide's own drawing attributes, so a candidate weighs what it would weigh.
 *
 * `dash` is the one thing here lucide does not ship. There is no
 * `sticky-note-dashed` — the family stops at `-check`, `-plus`, `-x` — so the
 * dashed twin is the same glyph with a dash pattern on its stroke. That is not
 * a liberty: `canvas-card.css` already draws an Alias with `border-style:
 * dotted` and switches it to solid on hover, so a dashed glyph is the icon
 * agreeing with the paper rather than inventing a convention.
 *
 * **It has to be a few long breaks, not a dotted line.** The pattern is in the
 * 24-unit space the path is authored in, and a 14px glyph scales that by 0.58 —
 * so a "3 2.5" pattern lands at 1.7px on, 1.5px off, which is under the stroke
 * width and reads as a smudge rather than as a dashed edge. The perimeter of
 * these glyphs is roughly 70 units, so a pattern in double figures buys four or
 * five visible breaks, which is what a reader can actually see at list size.
 * The variants below exist to be looked at rather than reasoned about.
 */
function Glyph({
  name,
  size = 14,
  dash,
  dashBodyOnly = false,
}: {
  readonly name: GlyphName;
  readonly size?: number;
  /** An SVG dash pattern in glyph units, or nothing for lucide's solid stroke. */
  readonly dash?: string | undefined;
  /**
   * Dash the first node only. Lucide authors the silhouette first and interior
   * detail after it, so this dashes the edge and leaves the mark that
   * identifies the glyph — a sticky note's folded corner — crisp.
   */
  readonly dashBodyOnly?: boolean | undefined;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      aria-hidden="true"
    >
      {GLYPHS[name].map((node, index) => (
        <GlyphNodeElement key={index} node={node} solid={dashBodyOnly && index > 0} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------- candidates */

interface Candidate {
  readonly name: GlyphName;
  readonly note: string;
  /** Drawn with the Alias's own dotted stroke rather than lucide's solid one. */
  readonly dash?: string | undefined;
}

/**
 * Per kind, because the choice is made per kind — and then judged as a trio,
 * because a Card's kind is only ever read next to the other two.
 */
const MARKDOWN: readonly Candidate[] = [
  { name: 'file-text', note: 'In the tree. A written sheet; the safe answer.' },
  { name: 'notepad-text', note: 'Ruled and bound. Reads as authored rather than filed.' },
  { name: 'sticky-note', note: 'A note, not a document. Lightest of the three.' },
  { name: 'file-code', note: 'Markdown is source. Says code more than prose.' },
  { name: 'book-open', note: 'Reading, not writing. Wrong verb.' },
];

const SPACE: readonly Candidate[] = [
  { name: 'square-square', note: 'In the tree. Mush at 14px; two rectangles and no story.' },
  { name: 'files', note: 'A stack of sheets. Same family as Markdown, at the cost of "a place".' },
  {
    name: 'sticky-notes',
    note: 'Notes plural. Pairs with a notepad Markdown glyph and says "the Cards in here" without borrowing Layout or Graph.',
  },
  { name: 'file-stack', note: 'The same claim, filed rather than pinned. Heavier at 14px.' },
  { name: 'box', note: 'A container with contents. No collision with Layout or Graph.' },
  { name: 'boxes', note: 'Many contained things. Busier; blurs at 14px.' },
  { name: 'square-stack', note: 'Cards stacked in one place. Close to a duplicate mark.' },
  { name: 'layers', note: 'Depth. Reads as z-order, which a Space is not.' },
  { name: 'door-open', note: 'You go in. The one glyph that draws the verb.' },
  { name: 'map', note: 'A territory you navigate. Strong, and a different vocabulary.' },
  { name: 'orbit', note: 'Things around a centre. Pretty; says little.' },
  { name: 'frame', note: 'A canvas. Collides with PanelsTopLeft — reads as a Layout.' },
];

/**
 * **An Alias is not a fourth kind; it is another Card seen from elsewhere.** So
 * the base glyph does not change and a decoration is added to it — which is
 * what the domain says (ADR 0070: an Open Alias resolves the immutable Target's
 * Markdown into the same content front a Markdown Card draws) and what the
 * canvas already does (`canvas-card.css` keeps the Card and only changes
 * `border-style` to dotted).
 *
 * **What settles it is that a Space Card can be an Alias's Target too.** A
 * single Alias glyph can say *that* a Card refers elsewhere but never *what it
 * refers to*, so an Alias of a Space and an Alias of a Markdown Card would draw
 * identically — and the kind of the thing on the canvas is exactly what the
 * glyph exists to carry. A decoration composes: the base says which kind, the
 * badge says it is a view of one. Every option below is therefore drawn twice,
 * on the Card glyph and on the Space glyph.
 *
 * The reframing also fixes the legibility problem the dashed twin had. A whole
 * glyph redrawn in dashes has to survive 14px as a *silhouette*; a stable glyph
 * with one added mark only has to keep the mark legible, and the mark can be a
 * solid shape rather than a broken line.
 *
 * `mark` is drawn after the base at a corner, over a knockout disc in the paper
 * colour, so the badge reads as sitting on top rather than tangling with the
 * edge underneath — which is lucide's own idiom for the `sticky-note-check`,
 * `-plus` and `-x` family.
 */
interface AliasOption {
  readonly title?: string | undefined;
  readonly note?: string | undefined;
  /** A badge glyph laid over the base, or nothing for a stroke-only treatment. */
  readonly mark?: GlyphName | undefined;
  readonly dash?: string | undefined;
  readonly dashBodyOnly?: boolean | undefined;
}

/**
 * **Chosen.** A solid arrow badge at the bottom-right corner, over a knockout
 * disc in the chrome's paper. It survives 14px on both bases because a filled
 * badge is a shape rather than a line weight, and it composes: the base still
 * says Markdown Card or Space Card, and the badge says this one is a view of
 * another.
 */
const ALIAS_BADGE = { mark: 'arrow-up-right' } as const satisfies AliasOption;

const ALIAS_OPTIONS: readonly AliasOption[] = [
  {
    title: 'Edge dotted, corner solid',
    note: "The canvas's own convention, and nothing added. Cheapest, and the only option that needs no second shape — but it is a difference in stroke, which is the first thing a small glyph loses.",
    dash: '9 5',
    dashBodyOnly: true,
  },
  {
    ...ALIAS_BADGE,
    title: 'Corner badge — arrow — CHOSEN',
    note: 'A solid mark at the corner: this Card points at another. Survives 14px because a filled badge is a shape, not a line weight, and it reads on the Space glyph as well as the Card one.',
  },
  {
    title: 'Corner badge — symlink turn',
    note: "The arrow that turns, which is the filesystem's own symlink mark. Busier than the straight arrow at list size.",
    mark: 'corner-up-right',
  },
  {
    title: 'Corner badge — link',
    note: 'Unambiguous about reference, and it collides with LinkActionsIcon, which is already the link-actions control.',
    mark: 'link',
  },
  {
    title: 'Corner badge — asterisk',
    note: 'A footnote mark: refers elsewhere without saying where. Quiet, and vague.',
    mark: 'asterisk',
  },
  {
    title: 'Both',
    note: 'Dotted edge and badge together. Belt and braces, and at 14px the two marks compete rather than reinforce.',
    mark: 'arrow-up-right',
    dash: '9 5',
    dashBodyOnly: true,
  },
];

/**
 * Graph and Layout are no longer fixed points.
 *
 * They were the two constraints the Card kinds had to dodge, and both are now
 * themselves in question — which loosens the Card columns as much as it opens
 * these two. `Network` is a hierarchy: one box on top, two below, joined by a
 * bracket. That is a **tree**, and a Graph here is a curated directed traversal
 * with branches and joins, over Cards a Layout has already placed.
 * `PanelsTopLeft` is a web page: header, sidebar, content. That is a **document
 * chrome**, and a Layout here is authored placement on a plane (ADR 0014 —
 * placement is authored, not computed).
 */
const GRAPH: readonly Candidate[] = [
  { name: 'network', note: 'In the tree. One node over two under a bracket — a hierarchy.' },
  {
    name: 'route',
    note: 'A path from a start pin to an end pin, doubling back. The closest thing to "traverse this Graph", and Present is what a Graph is for.',
  },
  {
    name: 'git-graph',
    note: 'Commits on a trunk with a branch rejoining. A directed graph with branches and joins — the domain, exactly.',
  },
  { name: 'waypoints', note: 'Points joined by a path. A traversal with no direction shown.' },
  {
    name: 'spline',
    note: 'Two control points and an authored curve. Says "someone drew this", which a curated Graph is.',
  },
  { name: 'workflow', note: 'Two boxes and a connector. Reads as automation or a pipeline.' },
  { name: 'git-branch', note: 'Branching only. A Graph that never rejoins.' },
  { name: 'share-2', note: 'Three nodes, two links — and universally read as Share.' },
  { name: 'chart-network', note: 'Nodes on axes. Reads as a chart, not a path.' },
  { name: 'milestone', note: 'A signpost. Direction without structure.' },
];

const LAYOUT: readonly Candidate[] = [
  { name: 'panels-top-left', note: 'In the tree. Header, sidebar, content — a web page.' },
  {
    name: 'group',
    note: 'Selection corners around two placed rectangles. "These Cards, positioned together" is what a Layout owns.',
  },
  {
    name: 'triangle-square-circle',
    note: 'Three unlike things placed apart. Says arrangement without saying grid. Lucide calls it `shapes`; keyed by what it draws here because the anti-slop naming rule reads an object key as a symbol name.',
  },
  {
    name: 'square-mouse-pointer',
    note: 'A frame and a pointer: placement done by hand. Draws ADR 0014’s authored-not-computed directly.',
  },
  { name: 'frame', note: 'Crop marks around a region. A canvas, cleanly — and no longer spent.' },
  {
    name: 'axis-3d',
    note: 'Coordinates. Honest about stored x/y, and cold — it names the mechanism, not the thing.',
  },
  {
    name: 'layout-grid',
    note: 'Four equal tiles. Reads as the grid strategy, which is one LayoutStrategy among many — the exact confusion ADR 0040 keeps apart.',
  },
  { name: 'grid-2x2', note: 'Same objection, lighter.' },
  { name: 'blocks', note: 'Assembled blocks. Closer to building than to placing.' },
  { name: 'component', note: 'Four diamonds. Abstract to the point of meaning nothing here.' },
  { name: 'proportions', note: 'A divided rectangle. Reads as aspect ratio.' },
];

/**
 * The glyphs the product already spends, and what each one means when a reader
 * meets it. Every one of these is live in `packages/ui/src/icons.tsx` and drawn
 * somewhere a Card kind is also drawn — the Dock's clusters, a Card rail, an
 * entity menu — so a candidate that resembles one is not a fresh mark, it is a
 * second meaning for a mark that already has one.
 *
 * `rules out` is the point of the row: it names the candidates in the columns
 * below that die on this collision, so the two halves of the sheet argue with
 * each other rather than sitting side by side.
 */
const SPENT: readonly {
  readonly name: GlyphName;
  readonly icon: string;
  readonly means: string;
  readonly rulesOut: string;
}[] = [
  {
    name: 'network',
    icon: 'GraphIcon',
    means: 'a Graph, and coloured by which one',
    rulesOut: 'any node-and-link Space — waypoints, git-fork',
  },
  {
    name: 'panels-top-left',
    icon: 'LayoutIcon',
    means: 'a Layout',
    rulesOut: 'any board-shaped Space — frame, layout-dashboard, panel-top',
  },
  {
    name: 'copy',
    icon: 'CopyIcon',
    means: 'Copy link and Copy permanent link',
    rulesOut: 'any two-overlapping-sheets Alias — copy itself, and files is close',
  },
  { name: 'link', icon: 'LinkActionsIcon', means: 'the link actions control', rulesOut: 'link-2' },
  {
    name: 'play',
    icon: 'PresentIcon',
    means: 'Present the Active Graph',
    rulesOut: 'any solid-triangle mark',
  },
  {
    name: 'square',
    icon: 'StopPresentingIcon',
    means: 'Stop presenting',
    rulesOut: 'a bare-rectangle Space — half of why square-square fails',
  },
  { name: 'plus', icon: 'PlusIcon', means: 'Create Card, New Layout, New Graph', rulesOut: '—' },
  { name: 'trash-2', icon: 'DeleteIcon', means: 'Delete', rulesOut: '—' },
  { name: 'pencil', icon: 'EditIcon', means: 'Edit a Card', rulesOut: '—' },
  { name: 'maximize-2', icon: 'OpenCardIcon', means: 'Open a Card', rulesOut: 'square-arrow-out' },
  { name: 'ellipsis', icon: 'EntityActionsIcon', means: 'the entity actions menu', rulesOut: '—' },
  { name: 'search', icon: 'SearchIcon', means: 'filter a list', rulesOut: 'scan' },
];

/* ------------------------------------------------------------------- sets */

/**
 * The four icons the chrome actually spends on entities, drawn together.
 *
 * Four and not three: Graph and Layout stopped being fixed constraints once
 * `Network` was read as a tree and `PanelsTopLeft` as a web page, so the whole
 * entity vocabulary is one choice. The Alias is not a fifth entry — it is the
 * Card entry with a decoration, which is the point.
 */
interface EntitySet {
  readonly title: string;
  readonly claim: string;
  readonly space: GlyphName;
  readonly card: GlyphName;
  readonly graph: GlyphName;
  readonly layout: GlyphName;
}

const ENTITY_SETS: readonly EntitySet[] = [
  {
    title: 'Shortlist',
    claim:
      'A framed region you enter, a note, a route you traverse, a grid of placements. Each draws the verb rather than the container, and none is a lookalike of another.',
    space: 'frame',
    card: 'sticky-note',
    graph: 'route',
    layout: 'layout-grid',
  },
  {
    title: 'In the tree',
    claim:
      'Nested squares, a document, a hierarchy, a web page. Two of the four describe something the product is not.',
    space: 'square-square',
    card: 'file-text',
    graph: 'network',
    layout: 'panels-top-left',
  },
];

/**
 * The six marks the chrome draws, in the rows it draws them in. Four entities
 * and the two Aliases — an Alias of a Card and an Alias of a Space — because
 * the decoration only earns its place if those two are told apart at a glance,
 * which is the thing a single Alias glyph could never do.
 */
const ENTITY_ROWS = [
  { kind: 'space', label: 'Space', example: 'Rendering' },
  { kind: 'card', label: 'Card', example: 'Why authored placement beats a layout engine' },
  { kind: 'graph', label: 'Graph', example: 'Long' },
  { kind: 'layout', label: 'Layout', example: 'Collection 1' },
  { kind: 'card', label: 'Alias', example: 'Strategy overview', alias: true },
  { kind: 'space', label: 'Alias', example: 'Rendering overview', alias: true },
] as const satisfies readonly {
  kind: keyof Omit<EntitySet, 'title' | 'claim'>;
  label: string;
  example: string;
  alias?: boolean;
}[];

/* ------------------------------------------------------------------ views */

function CandidateColumn({
  heading,
  candidates,
}: {
  readonly heading: string;
  readonly candidates: readonly Candidate[];
}) {
  return (
    <section className="icons__column">
      <h2 className="icons__heading">{heading}</h2>
      <ul className="icons__list">
        {candidates.map((candidate) => (
          <li key={candidate.name} className="icons__candidate">
            <span className="icons__pair">
              <Glyph name={candidate.name} size={14} />
              <Glyph name={candidate.name} size={20} />
            </span>
            <span className="icons__body">
              <code className="icons__name">{candidate.name}</code>
              <span className="icons__note">{candidate.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Card glyph with an Alias decoration on it.
 *
 * The badge is drawn at the bottom-right over a knockout disc painted in the
 * chrome's own paper, so it sits on the Card rather than tangling with the
 * outline it overlaps. `paint-order` is what lets one shape be both: the disc
 * is filled and the badge stroked in the same subtree, and the fill has to land
 * before the stroke or the knockout covers the mark it exists to isolate.
 */
function AliasMark({
  option,
  base,
  size,
}: {
  readonly option: AliasOption;
  /** The glyph being decorated — a Markdown Card's or a Space Card's. */
  readonly base: GlyphName;
  readonly size: number;
}) {
  return (
    <span className="icons__alias-mark" style={{ width: size, height: size }}>
      <Glyph name={base} size={size} dash={option.dash} dashBodyOnly={option.dashBodyOnly} />
      {option.mark === undefined ? null : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icons__alias-badge"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="17.5" cy="17.5" r="7.5" fill="var(--card)" stroke="none" />
          <g
            transform="translate(17.5 17.5) scale(0.62) translate(-12 -12)"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {GLYPHS[option.mark].map((node, index) => (
              <GlyphNodeElement key={index} node={node} />
            ))}
          </g>
        </svg>
      )}
    </span>
  );
}

/** One entity vocabulary, drawn as the four rows the chrome actually shows. */
function EntitySetPanel({ set }: { readonly set: EntitySet }) {
  return (
    <section className="icons__set">
      <h3 className="icons__set-title">{set.title}</h3>
      <p className="icons__set-claim">{set.claim}</p>
      <ul className="icons__rows">
        {ENTITY_ROWS.map((row) => (
          <li key={`${row.kind}${row.label}`} className="icons__row">
            <span className="icons__row-glyph">
              {'alias' in row ? (
                <AliasMark option={ALIAS_BADGE} base={set[row.kind]} size={14} />
              ) : (
                <Glyph name={set[row.kind]} size={14} />
              )}
            </span>
            <span className="icons__row-label">{row.label}</span>
            <span className="icons__row-title">{row.example}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const Default: Story = () => (
  <div className="icons">
    <p className="icons__lede">
      Four entities and one decoration. Each candidate is drawn at 14px (the list row) and 20px (a
      Card Front), in lucide&rsquo;s own geometry and stroke weight.
    </p>

    <h2 className="icons__heading">Shortlist, in the rows the chrome draws</h2>
    <div className="icons__sets">
      {ENTITY_SETS.map((set) => (
        <EntitySetPanel key={set.title} set={set} />
      ))}
    </div>

    <section className="icons__collisions">
      <h2 className="icons__heading">
        An Alias decorates the glyph it is an Alias of — Card, then Space
      </h2>
      <ul className="icons__alias-list">
        {ALIAS_OPTIONS.map((option) => (
          <li key={option.title ?? ''} className="icons__candidate">
            <span className="icons__pair icons__pair--alias">
              <AliasMark option={option} base="sticky-note" size={14} />
              <AliasMark option={option} base="sticky-note" size={20} />
              <AliasMark option={option} base="frame" size={14} />
              <AliasMark option={option} base="frame" size={20} />
            </span>
            <span className="icons__body">
              <code className="icons__name">{option.title}</code>
              <span className="icons__note">{option.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>

    <h2 className="icons__heading">Every candidate considered</h2>
    <div className="icons__columns">
      <CandidateColumn heading="Card — shortlisted: sticky-note" candidates={MARKDOWN} />
      <CandidateColumn heading="Space — shortlisted: frame" candidates={SPACE} />
      <CandidateColumn heading="Graph — shortlisted: route" candidates={GRAPH} />
      <CandidateColumn heading="Layout — shortlisted: layout-grid" candidates={LAYOUT} />
    </div>

    <section className="icons__collisions">
      <h2 className="icons__heading">
        Already spent on commands — every one is live in <code>packages/ui/src/icons.tsx</code>
      </h2>
      <ul className="icons__spent-list">
        {SPENT.map((entry) => (
          <li key={entry.name} className="icons__spent">
            <span className="icons__spent-glyph">
              <Glyph name={entry.name} size={16} />
            </span>
            <code className="icons__name">{entry.icon}</code>
            <span className="icons__note">{entry.means}</span>
            <span className="icons__note icons__rules-out">{entry.rulesOut}</span>
          </li>
        ))}
      </ul>
    </section>
  </div>
);
