import {
  Check,
  ChevronDown,
  CircleAlert,
  CornerDownRight,
  FileText,
  Grid2x2,
  Maximize2,
  Minimize2,
  Network,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  Workflow,
  X,
} from 'lucide-react';

/** The computed View that draws Cards and every Graph in the Space. */
export const FlowIcon = () => <Workflow size={16} />;

/** The computed View that arranges Cards in a regular grid. */
export const GridIcon = () => <Grid2x2 size={16} />;

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

/** Edit the content of a Markdown Card. */
export const EditIcon = () => <Pencil size={14} />;

/** Commit the edit running on a Card's content. */
export const CommitEditIcon = () => <Check size={14} />;

/** Abandon the edit running on a Card's content. */
export const AbandonEditIcon = () => <X size={14} strokeWidth={3} />;

/** Open a Card in place. */
export const OpenCardIcon = () => <Maximize2 size={14} />;

/** Close a Card that is open in place. */
export const CloseCardIcon = () => <Minimize2 size={14} />;

/** The shared affordance for a trigger that opens a list or menu. */
export const ChevronDownIcon = () => <ChevronDown size={14} />;

/** Create a Markdown Card. */
export const PlusIcon = () => <Plus size={14} />;

/** The Card kind that points at another Card's content (ADR 0009). */
export const AliasIcon = ({ size = 14 }: { size?: number }) => <CornerDownRight size={size} />;

/** The Card kind that owns the Markdown it draws. */
export const MarkdownIcon = ({ size = 14 }: { size?: number }) => <FileText size={size} />;

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
