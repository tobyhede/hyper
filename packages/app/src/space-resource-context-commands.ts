import type { ResourceDocument, GraphId, MapId, UUID } from '@project/core';
import {
  graphColor,
  type CanvasSpaceResourceGraphCommands,
  type CanvasSpaceResourceMapCommands,
} from '@project/ui';
import type { CommandOutcomes } from './command-outcomes';
import { copyLink } from './clipboard';
import { GRAPH_PALETTE_ENTRIES, graphColorsByGraphId } from '@project/graph';
import { offered, renameDraftAnswer } from './authoring-commands';
import { coordinatedGraphDelete } from './coordinated-context-delete';
import { embeddedGraphAuthoringCommands } from './graph-authoring-commands';
import { embeddedMapAuthoringCommands } from './map-authoring-commands';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';

interface SpaceResourceContextCommands {
  readonly mapCommands: CanvasSpaceResourceMapCommands;
  readonly graphCommands?: CanvasSpaceResourceGraphCommands;
}

/** The target an Open Space Resource embeds, and what its rail's commands report into. */
export interface SpaceResourceRailContext {
  readonly entry: OpenSpace;
  readonly spaces: OpenSpaces;
  readonly containingSpaceId: UUID;
  /** The containing canvas's, where a Map report from this rail is held. */
  readonly commandOutcomes: CommandOutcomes;
  readonly complete: (
    completion: Exclude<EmbeddedContextCompletion, { kind: 'deleted-graph' }>,
  ) => AuthoringResult;
}

/** The Dock commands, addressed to the target and the context this Resource stores. */
export function spaceResourceContextCommands(
  { entry, spaces, containingSpaceId, commandOutcomes }: SpaceResourceRailContext,
  document: Extract<ResourceDocument, { kind: 'space' }>,
  select: (map: Pick<SpaceResourceTargetMap, 'id'>, graphId: GraphId) => string | null,
  available: () => boolean,
): SpaceResourceContextCommands {
  // The rail's own answer, asked again when a command is pressed.
  const embedded = {
    target: entry,
    spaces,
    containingSpaceId,
    select: (mapId: MapId, graphId: GraphId) => select({ id: mapId }, graphId),
    available,
  };
  const mapAuthoring = embeddedMapAuthoringCommands(embedded);
  const graphAuthoring = embeddedGraphAuthoringCommands(embedded);
  const location = spaces.browserLocation;
  const settled = async () =>
    (await spaces.waitForPersistence(entry.id)) &&
    (await spaces.waitForPersistence(containingSpaceId));
  const { map: mapId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const map = space.maps.find((each) => each.id === mapId);
  const graph = map?.graphs.find((each) => each.id === graphId);
  const addressed = mapAuthoring.map(mapId);
  // Each press is built from the capability that answers its availability,
  // so the rail draws a command unavailable exactly when invoking it would be.
  const mapCommands: CanvasSpaceResourceMapCommands = {
    // The containing canvas's command outcomes hold the report: the notice
    // is drawn by the Space the author is looking at, not by the target. The
    // editor holds a refused draft open on the report's sentence.
    onRename: offered(
      addressed.rename,
      (rename) => (title: string) =>
        renameDraftAnswer(commandOutcomes.run('map-manage', () => rename(title))),
    ),
    // Map authoring orders the creation and the selection write, and the
    // containing canvas holds its report. Where the caret goes is this rail's:
    // command outcomes requests it only for a current completion, so the rail
    // answers whether it went there from the outcome alone. The creation
    // authors in the target and never moves the containing canvas, so its
    // completion is held to the Map it was pressed on like any other outcome.
    onCreate: offered(mapAuthoring.create, (create) => async (scope: string) => {
      const outcome = await commandOutcomes.run('map-create', create, {
        completionMovesMap: false,
        continueAt: ({ mapId: created }) => ({
          target: { kind: 'control', name: 'map-name', scope: { id: scope, subject: created } },
          select: false,
          then: 'rename',
        }),
      });
      switch (outcome.kind) {
        case 'completed':
          return true;
        case 'refused':
        case 'unchanged':
        case 'unavailable':
        case 'broke':
        case 'discarded':
          return false;
      }
    }),
    // Map authoring waits for both Spaces, repoints every Space Resource that
    // selected the Map — this one included — and leaves the target's canvas
    // on the survivor; the containing canvas holds a refusal. The canvas it
    // leaves is the target's, not the containing one, so it claims no move.
    onDelete: offered(addressed.delete, (remove) => async () => {
      await commandOutcomes.run('map-delete', remove, { completionMovesMap: false });
    }),
    onCopyLink: () => copyLink(location.href({ kind: 'map', spaceId: entry.id, mapId })),
  };
  if (map === undefined || graph === undefined) return { mapCommands };
  const addressedGraph = graphAuthoring.map(mapId).graph(graphId);
  return {
    mapCommands,
    graphCommands: {
      deleteDisabled: map.graphs.length <= 1,
      // The colour the Graph's row line draws, so the two marks agree for a
      // Graph that stores none.
      color: graphColor(graph, graphColorsByGraphId(space)),
      colors: GRAPH_PALETTE_ENTRIES,
      // Graph authoring completes both in the target; the containing canvas's
      // command outcomes hold a refusal, and the rail says no sentence of its
      // own. A refused rename is also the editor's, which holds the draft open.
      onRename: offered(
        addressedGraph.rename,
        (rename) => (title: string) =>
          renameDraftAnswer(commandOutcomes.run('graph-edit', () => rename(title))),
      ),
      onRecolor: offered(addressedGraph.recolor, (recolor) => (color: string) => {
        commandOutcomes.run('graph-edit', () => recolor(color));
      }),
      // Graph authoring orders the creation and the selection write, and the
      // containing canvas holds its report. The rail does not continue into
      // the new Graph's name, and the creation never moves the containing
      // canvas's Map.
      onCreate: offered(graphAuthoring.map(mapId).create, (create) => async () => {
        await commandOutcomes.run('graph-create', create);
      }),
      onDelete: async () => {
        const updated = entry.app.currentSpace().maps.find((each) => each.id === mapId);
        const result = await coordinatedGraphDelete(
          entry.spaceResources.deleteGraph,
          {
            targetSpaceId: entry.id,
            mapId,
            graphId,
            preferredGraphId: updated?.activeGraph ?? null,
          },
          settled,
        );
        if (result.kind === 'error') return result.message;
        if (result.kind === 'completed' && entry.app.navigation.getState().selectedMapId === mapId)
          entry.app.navigation.activateGraph(result.graphId);
        return null;
      },
      onCopyLink: () =>
        copyLink(location.href({ kind: 'map-graph', spaceId: entry.id, mapId, graphId })),
    },
  };
}
