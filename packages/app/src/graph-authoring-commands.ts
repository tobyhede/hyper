import type { GraphId, MapId } from '@project/core';
import { completionOutcome, type Capability, type EditOutcome } from './authoring-commands';
import {
  embeddedContext,
  topLevelContext,
  type AuthoredSpace,
  type AuthoringContext,
  type EmbeddedAuthoring,
} from './authoring-contexts';

/**
 * Graph Edits, as one interface for every context that authors a Graph.
 *
 * A Graph is authored from two places: the Command Dock, over the Active
 * Graph of the Map on the canvas, and an Open Space Resource's rail, over a
 * Graph of the target Space it embeds. This module decides once whether a
 * command is available, which Edit to complete and how to say a refusal,
 * over the two contexts every authoring command module shares
 * (`authoring-contexts.ts`), and answers both callers in the shared capability
 * and outcome vocabulary (`authoring-commands.ts`). What is Graph-specific
 * stays here: the Edits a Graph takes and the title a refusal is reported
 * under.
 *
 * **What stays outside.** Which Graph is active, Copy link, where the caret
 * goes and how a report is drawn are the surfaces'. The report's lifetime is
 * command outcomes' (`command-outcomes.ts`): a refused outcome carries the
 * complete notice. So this module imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it, and
 * `graph-authoring-commands.test.ts` scans for it).
 */

/** Rename one Graph: synchronous, so an inline editor can hold a refused draft open. */
export type GraphRename = Capability<(title: string) => EditOutcome>;

/** Store one Graph's colour, which the canvas draws its Edges in. */
export type GraphRecolor = Capability<(color: string) => EditOutcome>;

/** The commands addressed to one Graph. */
export interface GraphCommands {
  readonly rename: GraphRename;
  readonly recolor: GraphRecolor;
}

/** The Graph Edits addressed to one Map: `graph(graphId)` answers the Graph-addressed ones. */
export interface MapGraphCommands {
  readonly graph: (graphId: GraphId) => GraphCommands;
}

/** Every Graph Edit one context offers, addressed through the Map that owns the Graph. */
export interface GraphAuthoringCommands {
  readonly map: (mapId: MapId) => MapGraphCommands;
}

/**
 * Whether each command may run, as the surface answers it.
 *
 * Two answers because they differ at the top level: a rename is a chrome
 * title edit, and a recolour is an entity Edit (`authoring-availability.ts`).
 */
export interface GraphAuthoringAvailability {
  readonly rename: () => boolean;
  readonly recolor: () => boolean;
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

const UNCHANGED_TITLE = 'Graph unchanged';

const graphAuthoringCommands = (
  context: AuthoringContext,
  available: GraphAuthoringAvailability,
): GraphAuthoringCommands => ({
  map: (mapId) => ({
    graph: (graphId) => {
      const addressed = (): boolean => context.addressesGraph(mapId, graphId);
      const renames = (): boolean => available.rename() && addressed();
      const recolors = (): boolean => available.recolor() && addressed();
      return {
        rename: {
          available: renames(),
          invoke: (title) =>
            renames()
              ? completionOutcome(
                  context.complete(mapId, { kind: 'renamed-graph', graphId, title }),
                  UNCHANGED_TITLE,
                )
              : UNAVAILABLE,
        },
        recolor: {
          available: recolors(),
          invoke: (color) =>
            recolors()
              ? completionOutcome(
                  context.complete(mapId, { kind: 'recolored-graph', graphId, color }),
                  UNCHANGED_TITLE,
                )
              : UNAVAILABLE,
        },
      };
    },
  }),
});

/**
 * Graph Edits on the Space the canvas draws (`topLevelContext`).
 *
 * It addresses the Active Graph of the selected Map only, which is the one
 * Graph the Dock names; any other is a stale press, answered unavailable.
 *
 * `available` is the composition's answer to whether each chrome command may
 * run; it is as live as the caller makes it.
 */
export function topLevelGraphAuthoringCommands(
  space: AuthoredSpace,
  available: GraphAuthoringAvailability,
): GraphAuthoringCommands {
  return graphAuthoringCommands(topLevelContext(space), available);
}

/**
 * Graph Edits on a target Space an Open Space Resource embeds
 * (`embeddedContext`).
 *
 * It addresses any Graph of any Map of the target while the target is still
 * the open entry, without moving the target's own canvas.
 */
export function embeddedGraphAuthoringCommands({
  available,
  ...embedded
}: EmbeddedAuthoring): GraphAuthoringCommands {
  return graphAuthoringCommands(embeddedContext(embedded), {
    rename: available,
    recolor: available,
  });
}
