import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  CornerDownRight,
  Ellipsis,
  FileText,
  Link,
  Maximize,
  Maximize2,
  Minus,
  Minimize2,
  Network,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  SquareSquare,
  Trash2,
  X,
} from 'lucide-react';
import type { ComponentProps } from 'react';

type CardActionIconProps = ComponentProps<typeof Pencil>;
type CanvasControlIconProps = ComponentProps<typeof Minus>;

/** An authored Layout: the Cards a Space placed, and the Graphs over them. */
export const LayoutIcon = () => <PanelsTopLeft size={16} />;

/** A directed Graph, including its branches and joins. */
export const GraphIcon = ({
  color = 'currentColor',
  size = 16,
}: {
  color?: string;
  size?: number;
}) => <Network color={color} size={size} />;

/** Start presenting the active Graph. */
export const PresentIcon = ({ color }: { color: string }) => <Play color={color} size={12} />;

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

/** The Card kind that points at another Card's content (ADR 0009). */
export const AliasIcon = ({ size = 14 }: { size?: number }) => <CornerDownRight size={size} />;

/** The Card kind that owns the Markdown it draws. */
export const MarkdownIcon = ({ size = 14 }: { size?: number }) => <FileText size={size} />;

/** The Card kind that shows one selected view of another Space (ADR 0068). */
export const SpaceCardIcon = ({ size = 14 }: { size?: number }) => <SquareSquare size={size} />;

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
