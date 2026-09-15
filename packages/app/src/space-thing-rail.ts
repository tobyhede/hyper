import type { PaletteColorEntry } from '@project/ui';

/** One entity a Space Thing's selectors can be pointed at, named as an author reads it. */
export interface CanvasSpaceThingChoice {
  readonly id: string;
  readonly title: string;
}

/**
 * Kind commands for one Diagram or Graph on an Open Space Thing rail.
 *
 * Rename, create, delete and copy — the same verbs the Dock spends on that
 * entity, addressed here to the context this Thing stores.
 */
export interface CanvasSpaceThingCommands {
  readonly onRename: (title: string) => string | null;
  readonly onCreate: (renameScope: string) => Promise<string | null>;
  readonly onDelete: () => Promise<string | null>;
  readonly onCopyLink: () => Promise<string | null>;
  readonly deleteDisabled: boolean;
}

export interface CanvasSpaceThingGraphCommands extends CanvasSpaceThingCommands {
  readonly color: string;
  readonly colors: readonly PaletteColorEntry[];
  readonly onRecolor: (color: string) => string | null;
  readonly onCopyPermanentLink: () => Promise<string | null>;
}

/**
 * What {@link SpaceThingRailClusters} needs to draw Diagram and Graph on a
 * Space Thing rail, minus portal Read/Edit which stays on the Thing front.
 *
 * The four choice fields move together: the Graphs on offer are the selected
 * Diagram's, so a caller that changed the Diagram without changing the list
 * beside it would be offering Graphs from a Diagram this Thing no longer shows.
 */
export interface SpaceThingRailClustersProps {
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onReport: (message: string | null) => void;
  readonly diagramCommands?: CanvasSpaceThingCommands;
  readonly graphCommands?: CanvasSpaceThingGraphCommands;
  readonly diagrams: readonly CanvasSpaceThingChoice[];
  readonly graphs: readonly CanvasSpaceThingChoice[];
  /** The selected Diagram, or `null` where the Thing selects none. */
  readonly diagramId: string | null;
  readonly graphId: string | null;
  readonly onDiagramChange: (diagramId: string) => void;
  readonly onGraphChange: (graphId: string) => void;
  /**
   * The selections are read but cannot be changed right now.
   *
   * Distinct from an absent rail, which means the target Space has not been
   * read yet: a canvas that has withdrawn authoring still knows which Diagram
   * and Graph this Thing selects.
   */
  readonly disabled?: boolean;
}
