import {
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  Link,
  LogIn,
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
  Unlink,
  X,
} from 'lucide-react';
import { useId, type ComponentProps, type ComponentType } from 'react';
import type { Resource } from '@project/core';

type ResourceActionIconProps = ComponentProps<typeof Pencil>;
type CanvasControlIconProps = ComponentProps<typeof Minus>;

/**
 * An authored Map: the Resources a Space placed, and the Graphs over them.
 *
 * Placements on a plane, not a page-chrome glyph such as `PanelsTopLeft` — a
 * header, a sidebar and a content well describe nothing the product does. A
 * Map is authored placement (ADR 0014 — placement is authored, not
 * computed), so the glyph is the placements.
 *
 * `size` exists for the same reason `SpaceIcon` and `GraphIcon` carry one: a
 * surface that draws two identity glyphs in one column has to draw them at one
 * size, and the canvas HUD draws this one beside a 13px Space cube. The default
 * is 16.
 */
export const MapIcon = ({ size = 16 }: { size?: number | undefined }) => <LayoutGrid size={size} />;

/**
 * A directed Graph, including its branches and joins.
 *
 * A path from a start pin to an end pin, not a glyph such as `Network` — one
 * node above two, joined by a bracket — which draws a *hierarchy*, where a
 * Graph is a curated traversal over Resources a Map has already placed. Present is what a
 * Graph is for, and a path is the resource you present.
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
 *
 * The SVG takes the shared 16px icon box. Its mark stays optically smaller
 * inside that box, matching the transport controls without making a Button
 * negotiate a second icon size.
 */
export const PresentIcon = ({ color, filled = false }: { color: string; filled?: boolean }) => (
  <Play className="origin-center scale-75" color={color} fill={filled ? color : 'none'} size={16} />
);

/** Stop presenting and return to the Space overview. */
export const StopPresentingIcon = ({ color }: { color: string }) => (
  <Square className="origin-center scale-75" color={color} size={16} />
);

/** Edit the content of a Markdown Resource. */
export const EditIcon = (props: ResourceActionIconProps) => <Pencil size={14} {...props} />;

/** Commit the edit running on a Resource's content. */
export const CommitEditIcon = (props: ResourceActionIconProps) => <Check size={14} {...props} />;

/** Abandon the edit running on a Resource's content. */
export const AbandonEditIcon = (props: ResourceActionIconProps) => (
  <X size={14} strokeWidth={3} {...props} />
);

/**
 * Enter the Space a Space Resource references.
 *
 * Lucide `log-in`: an arrow going *into* a container, deliberately unlike
 * Open's `maximize-2`. Entering the Space and expanding the Resource in place
 * are two destinations and must not share a symbol.
 */
export const EnterSpaceIcon = (props: ResourceActionIconProps) => <LogIn size={14} {...props} />;

/**
 * Open the Space a Space Resource shows, in a new browsing context.
 *
 * Lucide `external-link`: the destination leaves this tab. Enter's `log-in`
 * stays the crossing that keeps the session; this one is a link (ADR 0068).
 */
export const OpenIndependentlyIcon = (props: ResourceActionIconProps) => (
  <ExternalLink size={14} {...props} />
);

/** Open a Resource in place. */
export const OpenResourceIcon = (props: ResourceActionIconProps) => (
  <Maximize2 size={14} {...props} />
);

/** Close a Resource that is open in place. */
export const CloseResourceIcon = (props: ResourceActionIconProps) => (
  <Minimize2 size={14} {...props} />
);

/** The shared affordance for a trigger that opens a list or menu. */
export const ChevronDownIcon = () => <ChevronDown size={14} />;

/** Search within the collection named by the surrounding input. */
export const SearchIcon = () => <Search size={16} />;

/** Create a Markdown Resource. */
export const PlusIcon = () => <Plus size={14} />;

/** Move the canvas camera one zoom step farther away. */
export const ZoomOutIcon = (props: CanvasControlIconProps) => <Minus size={14} {...props} />;

/** Move the canvas camera one zoom step closer. */
export const ZoomInIcon = (props: CanvasControlIconProps) => <Plus size={14} {...props} />;

/** Frame every visible canvas Resource in the viewport. */
export const FitViewIcon = (props: CanvasControlIconProps) => <Maximize size={14} {...props} />;

/** The Resource kind that owns the Markdown it draws. */
export const MarkdownIcon = ({ size = 14 }: { size?: number | undefined }) => (
  <StickyNote size={size} />
);

/**
 * The isometric cube shared by Spaces and Space Resources.
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
 */
const CubeGlyph = ({ size }: { size: number }) => {
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
      data-icon="space"
    >
      <g transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}>
        <Box size={view} strokeWidth={stroke / scale} />
      </g>
    </svg>
  );
};

/**
 * Opener/Meta uses the OPEN infinity-cube artwork. This product mark is the one
 * custom exception to the Lucide vocabulary; icons.test.tsx holds its geometry
 * to the supplied 16px SVG.
 */
export const ParentIcon = ({ size = 16 }: { size?: number | undefined }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    fillRule="evenodd"
    aria-hidden="true"
    data-icon="parent"
  >
    <path d="M4.5 2.5 8 .5 11.5 2.5 10 3.5 8 2.25 6 3.5Z" />
    <path d="M1 5.382 4.106 3.829 12.106 9.829 13 9.382V6.618L12.106 6.171 10.5 7.375 8.833 6.125 11.894 3.829 15 5.382V10.618L11.894 12.171 3.894 6.171 3 6.618V9.382L3.894 9.829 5.5 8.625 7.167 9.875 4.106 12.171 1 10.618Z" />
    <path d="M4.5 13.5 6 12.5 8 13.75 10 12.5 11.5 13.5 8 15.5Z" />
  </svg>
);

/** A regular Space, drawn as a cube. */
export const SpaceIcon = ({ size = 14 }: { size?: number | undefined }) => (
  <CubeGlyph size={size} />
);

/** Space Resources share the Space cube, including when used as a Reference Resource base. */
export const SpaceResourceIcon = SpaceIcon;

/**
 * The Resource kinds that own what they draw, and so have a glyph of their own.
 *
 * A Reference Resource is deliberately absent: it is not a third silhouette but a badge on
 * one of these two.
 *
 * **Subtracted from the domain union rather than restated as its own.** Written
 * out as `'markdown' | 'space'` it would be a second list agreeing with
 * `Resource['kind']` only by hand, so a kind added to the domain would leave
 * every record keyed by this type exhaustive and wrong. Derived, the addition lands here, and
 * {@link BASE_GLYPHS} fails to build until the new kind has a silhouette.
 */
export type ResourceBaseKind = Exclude<Resource['kind'], 'reference'>;

/** What every base glyph accepts. */
interface BaseGlyphProps {
  size?: number;
}

/** The silhouette each Resource kind that owns one draws. */
export const BASE_GLYPHS = {
  markdown: MarkdownIcon,
  space: SpaceResourceIcon,
} satisfies Record<ResourceBaseKind, ComponentType<BaseGlyphProps>>;

/**
 * A Reference Resource, drawn as the glyph of the Resource it points at with a badge on it.
 *
 * **A Reference Resource is not a third Resource silhouette.** A single Reference Resource glyph can say
 * *that* a Resource refers elsewhere but never *what it refers to* — and a Space
 * Resource is as legitimate a Target as a Markdown Resource (ADR 0070), so the two
 * would draw identically while the kind on the canvas is exactly what the
 * glyph exists to carry. Keeping the base and adding a mark is also what the
 * canvas already does: `canvas-resource.css` keeps the Resource and changes only
 * `border-style` to dotted.
 *
 * **The hole is cut, not painted.** The badge sits over the base's own stroke,
 * and a disc filled with a background colour would have to know which surface
 * it is on — a menu, a popover, a Resource's cream face. An SVG mask removes that
 * region from the base instead, so whatever is behind shows through and the
 * mark is legible on every surface. `useId` keeps the mask reference unique
 * when several of these are drawn in one list, which they are.
 *
 * The badge is drawn at a heavier stroke than the base on purpose: at 14px it
 * is the mark that has to survive, and a filled shape survives where a line
 * weight does not.
 */
export function ReferenceIcon({
  base = 'markdown',
  size = 14,
}: {
  /** The kind of the Target. Absent, a Reference Resource draws over the Markdown base. */
  base?: ResourceBaseKind | undefined;
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
 * A link glyph for an entity's actions menu.
 *
 * Exported and drawn by no surface: the Resource rail, like every other entity
 * menu, draws {@link EntityActionsIcon}.
 */
export const LinkActionsIcon = (props: ResourceActionIconProps) => <Link size={14} {...props} />;

/**
 * Open an entity's actions menu, where the menu does not primarily serve one action.
 *
 * The conventional "more" glyph, and conventional is the whole argument: the
 * menu behind it holds a rename, addresses and a delete, and a glyph naming
 * any one of those would name the wrong one.
 */
export const EntityActionsIcon = (props: ResourceActionIconProps) => (
  <Ellipsis size={14} {...props} />
);

/** Put an address on the clipboard. */
export const CopyIcon = (props: ResourceActionIconProps) => <Copy size={14} {...props} />;

/**
 * An Edge's Title is shown at rest. The glyph draws the state; the control is
 * named for its action (`Hide Title`).
 */
export const ShowTitleIcon = (props: ResourceActionIconProps) => <Eye size={14} {...props} />;

/** An Edge's Title is hidden at rest. */
export const HideTitleIcon = (props: ResourceActionIconProps) => <EyeOff size={14} {...props} />;

/** Remove the entity the surrounding command names. */
export const DeleteIcon = (props: ResourceActionIconProps) => <Trash2 size={14} {...props} />;

/** Remove a Resource from this Map while it stays in the Space. */
export const RemoveFromMapIcon = (props: ResourceActionIconProps) => (
  <Unlink size={14} {...props} />
);
