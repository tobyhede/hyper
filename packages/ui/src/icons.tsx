import {
  ArrowRightFromLine,
  Check,
  ChevronDown,
  CornerDownRight,
  FileText,
  Grid2x2,
  Network,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  Workflow,
} from 'lucide-react';

/** The computed View that draws Cards and every Graph in the Space. */
export const FlowIcon = () => <Workflow size={16} />;

/** The computed View that arranges Cards in a regular grid. */
export const GridIcon = () => <Grid2x2 size={16} />;

/** An authored Layout: a spatial arrangement owned by a Space. */
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

/** The shared affordance for a trigger that opens a list or menu. */
export const ChevronDownIcon = () => <ChevronDown size={14} />;

/** Create a Markdown Card. */
export const PlusIcon = () => <Plus size={14} />;

/** The Card kind that points at another Card's content (ADR 0009). */
export const AliasIcon = ({ size = 14 }: { size?: number }) => <CornerDownRight size={size} />;

/** Start a Graph connection from the Card that carries the control. */
export const ConnectIcon = ({ size = 12 }: { size?: number }) => <ArrowRightFromLine size={size} />;

/** The Card kind that owns the Markdown it draws. */
export const MarkdownIcon = ({ size = 14 }: { size?: number }) => <FileText size={size} />;

/** Mark the selected item in a list. */
export const CheckIcon = () => <Check color="var(--accent)" size={14} />;
