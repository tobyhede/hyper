import {
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Ellipsis,
  Frame,
  LayoutGrid,
  Link,
  Maximize,
  Maximize2,
  Minus,
  Minimize2,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  Square,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useId, type ComponentProps, type ComponentType } from 'react';
import type { Card } from '@project/core';

type CardActionIconProps = ComponentProps<typeof Pencil>;
type CanvasControlIconProps = ComponentProps<typeof Minus>;

/**
 * An authored Layout: the Cards a Space placed, and the Graphs over them.
 *
 * Placements on a plane. This was `PanelsTopLeft` — a header, a sidebar and a
 * content well, which is a *web page chrome* and describes nothing the product
 * does. A Layout is authored placement (ADR 0014 — placement is authored, not
 * computed), so the glyph is the placements.
 */
export const LayoutIcon = () => <LayoutGrid size={16} />;

/**
 * A directed Graph, including its branches and joins.
 *
 * A path from a start pin to an end pin. This was `Network` — one node above
 * two, joined by a bracket — which draws a *hierarchy*, and a Graph is a
 * curated traversal over Cards a Layout has already placed. Present is what a
 * Graph is for, and a path is the thing you present.
 *
 * Drawn heavier than Lucide's default 2. This is the only glyph in the set
 * carrying a *colour* rather than ink, and the palette is pastel because those
 * values are chosen as a stroke on the sand canvas; at 14px on light chrome the
 * same value at the default weight is the faintest mark on the surface. Weight
 * is the right lever because it leaves the hue exactly as the canvas draws it,
 * which is the whole reason the glyph is coloured at all.
 */
export const GraphIcon = ({
  color = 'currentColor',
  size = 16,
}: {
  color?: string;
  size?: number;
}) => <Route color={color} size={size} strokeWidth={2.5} />;

/**
 * Start presenting the active Graph.
 *
 * `filled` draws the solid triangle transport controls are read as, rather
 * than Lucide's outline. It is a prop and not a stylesheet's business: Lucide
 * writes `fill="none"` as a presentation *attribute*, so the only way in from
 * outside is a rule reaching through the button and into the `svg` — which is
 * a surface overriding a glyph's own drawing. The fill is the colour the glyph
 * was already given, so a filled triangle and an outlined one are the same
 * mark at the same value.
 */
export const PresentIcon = ({ color, filled = false }: { color: string; filled?: boolean }) => (
  <Play color={color} fill={filled ? color : 'none'} size={12} />
);

/** Stop presenting and return to the Space overview. */
export const StopPresentingIcon = ({ color }: { color: string }) => (
  <Square color={color} size={12} />
);

/** Edit the content of a Markdown Card. */
export const EditIcon = (props: CardActionIconProps) => <Pencil size={14} {...props} />;

/** Commit the edit running on a Card's content. */
export const CommitEditIcon = (props: CardActionIconProps) => <Check size={14} {...props} />;

/** Abandon the edit running on a Card's content. */
export const AbandonEditIcon = (props: CardActionIconProps) => (
  <X size={14} strokeWidth={3} {...props} />
);

/** Open a Card in place. */
export const OpenCardIcon = (props: CardActionIconProps) => <Maximize2 size={14} {...props} />;

/** Close a Card that is open in place. */
export const CloseCardIcon = (props: CardActionIconProps) => <Minimize2 size={14} {...props} />;

/** The shared affordance for a trigger that opens a list or menu. */
export const ChevronDownIcon = () => <ChevronDown size={14} />;

/** Search within the collection named by the surrounding input. */
export const SearchIcon = () => <Search size={16} />;

/** Create a Markdown Card. */
export const PlusIcon = () => <Plus size={14} />;

/** Move the canvas camera one zoom step farther away. */
export const ZoomOutIcon = (props: CanvasControlIconProps) => <Minus size={14} {...props} />;

/** Move the canvas camera one zoom step closer. */
export const ZoomInIcon = (props: CanvasControlIconProps) => <Plus size={14} {...props} />;

/** Frame every visible canvas Card in the viewport. */
export const FitViewIcon = (props: CanvasControlIconProps) => <Maximize size={14} {...props} />;

/** The Card kind that owns the Markdown it draws. */
export const MarkdownIcon = ({ size = 14 }: { size?: number | undefined }) => (
  <StickyNote size={size} />
);

/** The Card kind that shows one selected view of another Space (ADR 0068). */
export const SpaceCardIcon = ({ size = 14 }: { size?: number | undefined }) => (
  <Frame size={size} />
);

/**
 * The Space you came from, drawn as the volume the one you are in sits inside.
 *
 * **Two Spaces named side by side cannot both take the Space glyph.** The
 * Command Dock draws the Space you are in beside the Space you entered it from,
 * and giving both {@link SpaceCardIcon} drew two identical clusters at the same
 * size and the same `--muted-foreground` — the glyph is what a reader matches
 * on, so repeating it made the pair harder to tell apart rather than easier.
 *
 * A kind glyph cannot separate them, because both rows really are Spaces. What
 * differs is position, so the mark says position: the Space you are on is a
 * frame, because a frame is the surface you are working on, and the Space you
 * came from is the volume that surface is inside. The rows then differ in
 * silhouette at no width and with no cut base, and the cube is the same object
 * at a different depth rather than a foreign glyph. Chosen over a direction
 * mark and over a badged composite; the alternatives are in
 * `.scratch/command-dock/issues/06-...`.
 *
 * **The scale is an optical correction, not a size.** Lucide's `box` has a
 * geometry box 20 units tall — `3..21` across by `2..22` down, read off
 * `getBBox` rather than off the vertices in the path data, which stop short of
 * the arcs that round the corners — against `Frame`'s 22 square. Drawn raw it
 * reads noticeably smaller than the glyph it stands beside. Scaling so that 20
 * units plus the stroke comes to 24 lands the ink at 24 tall and 21.8 wide:
 * the same width as the frame, and a ninth more height, which is what a cube
 * needs to read as the same size as a square. An isometric silhouette also
 * leaves all four corners of its box empty, so the eye sizes it by ink rather
 * than by extents — icon sets correct for that rather than measure it, and
 * lucide's own circles are 20 units where its squares are 18.
 *
 * The stroke is a quarter-unit above lucide's 2 because this glyph is drawn on
 * lightened chrome, and a mark that has been lightened needs the weight back —
 * the same trade {@link GraphIcon} makes, in the same direction, for its pastel
 * canvas colour. The scale is derived from the stroke so the two cannot drift
 * apart, and the stroke is divided back out by the scale so the correction
 * changes the silhouette and not the weight.
 *
 * **What it costs.** It says *containing*, not *above* and not *back*, so the
 * reader learns the relationship but nothing in the mark says which way to
 * travel — and pressing it is still a move. It also gives one domain kind two
 * glyphs, so {@link SpaceCardIcon} stops answering "what does a Space look
 * like" on its own. A cube in isometric has an up-face, and filling it would
 * add the direction back; that is not taken here.
 */
export const ParentIcon = ({ size = 14 }: { size?: number | undefined }) => {
  const view = 24;
  const stroke = 2.25;
  const scale = (view - stroke) / 20;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
      aria-hidden="true"
      /* **The one thing a test can hold this glyph to.** The mark is
         `aria-hidden`, so nothing about it reaches the accessible name and a
         behaviour test can only ask "is there an icon here" — which is true of
         every icon and so checks nothing. `ui:catalog:check` cannot see this
         module either. Named rather than styled, so swapping the cube for a
         chevron fails the check that says the parent mark says *containing*. */
      data-icon="parent"
    >
      <g transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}>
        <Box size={view} strokeWidth={stroke / scale} />
      </g>
    </svg>
  );
};

/**
 * The Card kinds that own what they draw, and so have a glyph of their own.
 *
 * An Alias is deliberately absent: it is not a third silhouette but a badge on
 * one of these two.
 *
 * **Subtracted from the domain union rather than restated as its own.** Written
 * out as `'markdown' | 'space'` it was a second list agreeing with `Card['kind']`
 * only by hand, so a kind added to the domain left every record keyed by this
 * type exhaustive and wrong. Derived, the addition lands here, and
 * {@link BASE_GLYPHS} fails to build until the new kind has a silhouette.
 */
export type CardBaseKind = Exclude<Card['kind'], 'alias'>;

/** The silhouette each Card kind that owns one draws. */
export const BASE_GLYPHS = {
  markdown: MarkdownIcon,
  space: SpaceCardIcon,
} satisfies Record<CardBaseKind, ComponentType<{ size?: number }>>;

/**
 * An Alias, drawn as the glyph of the Card it points at with a badge on it.
 *
 * **An Alias is not a third Card silhouette.** A single Alias glyph can say
 * *that* a Card refers elsewhere but never *what it refers to* — and a Space
 * Card is as legitimate a Target as a Markdown Card (ADR 0070), so the two
 * would draw identically while the kind on the canvas is exactly what the
 * glyph exists to carry. Keeping the base and adding a mark is also what the
 * canvas already does: `canvas-card.css` keeps the Card and changes only
 * `border-style` to dotted.
 *
 * **The hole is cut, not painted.** The badge sits over the base's own stroke,
 * and a disc filled with a background colour would have to know which surface
 * it is on — a menu, a popover, a Card's cream face. An SVG mask removes that
 * region from the base instead, so whatever is behind shows through and the
 * mark is legible on every surface. `useId` keeps the mask reference unique
 * when several of these are drawn in one list, which they are.
 *
 * The badge is drawn at a heavier stroke than the base on purpose: at 14px it
 * is the mark that has to survive, and a filled shape survives where a line
 * weight does not.
 */
export function AliasIcon({
  base = 'markdown',
  size = 14,
}: {
  /** The kind of the Target. Absent, an Alias draws over the Markdown base. */
  base?: CardBaseKind | undefined;
  size?: number | undefined;
}) {
  const maskId = useId();
  const Base = BASE_GLYPHS[base];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle cx="17.5" cy="17.5" r="7.75" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <Base size={24} />
      </g>
      <g
        transform="translate(17.5 17.5) scale(0.62) translate(-12 -12)"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </g>
    </svg>
  );
}

/** Mark the selected item in a list. */
export const CheckIcon = () => <Check color="var(--accent)" size={14} />;

/**
 * Something went wrong and the surface carrying this says what. Sized by the
 * caller's own icon rules rather than a fixed `size`, because it is drawn both
 * beside a line of Alert text and inside a toolbar button.
 */
export const AlertIcon = () => <CircleAlert />;

/** Close the surface that contains the control. */
export const CloseIcon = () => <X size={14} strokeWidth={3} />;

/**
 * Open an entity's actions menu, on a **Card rail**.
 *
 * A link glyph rather than the conventional kebab, and that argument is the
 * rail's alone: every other control there names its command (`EditIcon`,
 * `OpenCardIcon`, `CloseCardIcon`), so a generic "more" glyph beside them would
 * be the one control saying nothing about what it does.
 *
 * It is no longer the glyph the menu wears everywhere. The menu grew a rename
 * and a delete beside its addresses, so a Sidebar row — which has no cluster of
 * self-naming commands to sit in — draws `EntityActionsIcon` instead. Whether
 * the rail follows is a rail decision, taken when `CardNode` first supplies the
 * actions; until then this stays exactly what it draws today.
 */
export const LinkActionsIcon = (props: CardActionIconProps) => <Link size={14} {...props} />;

/**
 * Open an entity's actions menu, where the menu is not mostly one thing.
 *
 * The conventional "more" glyph, and conventional is the whole argument: a
 * Space title or a Sidebar row carries no other command to be generic beside,
 * and the menu behind it holds a rename, two addresses and a delete. A glyph
 * naming any one of those would name the wrong one.
 */
export const EntityActionsIcon = (props: CardActionIconProps) => <Ellipsis size={14} {...props} />;

/** Put an address on the clipboard. */
export const CopyIcon = (props: CardActionIconProps) => <Copy size={14} {...props} />;

/** Remove the entity the surrounding command names. */
export const DeleteIcon = (props: CardActionIconProps) => <Trash2 size={14} {...props} />;
