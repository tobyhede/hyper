import {
  graphHeadShape,
  type ResourceDocument,
  type GraphHeadShape,
  type GraphId,
  type MapId,
  type UUID,
} from '@project/core';
import {
  graphColor,
  type CanvasSpaceResourceCommands,
  type CanvasSpaceResourceGraphCommands,
} from '@project/ui';
import type { Continuation } from './continuation';
import { copyLink } from './clipboard';
import { GRAPH_PALETTE_ENTRIES, graphColorsByGraphId } from '@project/graph';
import { offered, renameDraftAnswer } from './authoring-commands';
import type { DeleteConfirmation, FocusFallback } from './delete-confirmation';
import { embeddedGraphAuthoringCommands, graphDeletionWords } from './graph-authoring-commands';
import { embeddedMapAuthoringCommands, mapDeletionWords } from './map-authoring-commands';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';

interface SpaceResourceContextCommands {
  readonly mapCommands: CanvasSpaceResourceCommands;
  readonly graphCommands?: CanvasSpaceResourceGraphCommands;
}

/** The target an Open Space Resource embeds, and what its rail's commands report into. */
export interface SpaceResourceRailContext {
  readonly entry: OpenSpace;
  readonly continuation: Continuation;
  readonly spaces: OpenSpaces;
  readonly containingSpaceId: UUID;
  /** The target Space's confirmation, presented alongside its drawn Map. */
  readonly deleteConfirmation: Pick<DeleteConfirmation, 'arm'>;
}

/** The Dock commands, addressed to the target and the context this Resource stores. */
export function spaceResourceContextCommands(
  { entry, spaces, containingSpaceId, deleteConfirmation, continuation }: SpaceResourceRailContext,
  document: Extract<ResourceDocument, { kind: 'space' }>,
  select: (targetMap: Pick<SpaceResourceTargetMap, 'id'>, graphId: GraphId) => string | null,
  available: () => boolean,
): SpaceResourceContextCommands {
  const { commandOutcomes } = entry.app;
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
  const { map: mapId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const targetMap = space.maps.find((each) => each.id === mapId);
  const graph = targetMap?.graphs.find((each) => each.id === graphId);
  const addressed = mapAuthoring.map(mapId);
  // Each press is built from the capability that answers its availability,
  // so the rail draws a command unavailable exactly when invoking it would be.
  const mapCommands: CanvasSpaceResourceCommands = {
    // The editor holds a refused draft open on the refusal's sentence.
    onRename: offered(
      addressed.rename,
      (rename) => (title: string) =>
        renameDraftAnswer(commandOutcomes.run('map-manage', () => rename(title))),
    ),
    // The target owns the Edit and its report; the source occurrence owns
    // the caret. A completion after that occurrence goes away still authors
    // the Map but cannot send focus into another occurrence.
    onCreate: offered(mapAuthoring.create, (create) => async (scope: string) => {
      const source = spaces.entry(containingSpaceId);
      const sourceMap = source?.app.authoring.getState().navigation.selectedMapId;
      const outcome = await commandOutcomes.run('map-create', create, {
        completionMovesMap: true,
      });
      switch (outcome.kind) {
        case 'completed': {
          if (source?.app.authoring.getState().navigation.selectedMapId !== sourceMap) return false;
          continuation.request({
            target: {
              kind: 'control',
              name: 'map-name',
              scope: { id: scope, subject: outcome.mapId },
            },
            select: false,
            then: 'rename',
          });
          return continuation.getState().pending !== null;
        }
        case 'refused':
        case 'unchanged':
        case 'unavailable':
        case 'broke':
        case 'discarded':
          return false;
      }
    }),
    // Asked first, through the target Space's delete confirmation, in
    // the words the Dock's Delete Map asks. Map authoring waits for both
    // Spaces, repoints every Space Resource that selected the Map — this one
    // included — and leaves the target's canvas on the survivor; the
    // target holds a refusal or a break and claims the selection move.
    onDelete:
      targetMap === undefined
        ? null
        : offered(addressed.delete, (remove) => (focusFallback: FocusFallback) => {
            deleteConfirmation.arm({
              ...mapDeletionWords(targetMap),
              run: async () => {
                await commandOutcomes.run('map-delete', remove, { completionMovesMap: true });
              },
              focusFallback,
            });
          }),
    onCopyLink: () => copyLink(location.href({ kind: 'map', spaceId: entry.id, mapId })),
  };
  if (targetMap === undefined || graph === undefined) return { mapCommands };
  const addressedGraph = graphAuthoring.map(mapId).graph(graphId);
  return {
    mapCommands,
    graphCommands: {
      // The colour the Graph's row line draws, so the two marks agree for a
      // Graph that stores none.
      color: graphColor(graph, graphColorsByGraphId(space)),
      colors: GRAPH_PALETTE_ENTRIES,
      // Graph authoring completes both in the target; that Space's
      // outcomes hold a refusal or a break, and the rail says no
      // sentence of its own. A refused rename is also the editor's, which holds
      // the draft open.
      onRename: offered(
        addressedGraph.rename,
        (rename) => (title: string) =>
          renameDraftAnswer(commandOutcomes.run('graph-edit', () => rename(title))),
      ),
      onRecolor: offered(addressedGraph.recolor, (recolor) => (color: string) => {
        commandOutcomes.run('graph-edit', () => recolor(color));
      }),
      headShape: graphHeadShape(graph),
      onChangeHeadShape: offered(
        addressedGraph.changeHeadShape,
        (change) => (headShape: GraphHeadShape) => {
          commandOutcomes.run('graph-edit', () => change(headShape));
        },
      ),
      // Graph authoring orders the creation and the selection write, and the
      // target Space holds its report. The rail does not continue into
      // the new Graph's name, so the caret never goes there, and the creation
      // never moves the containing canvas's Map.
      onCreate: offered(graphAuthoring.map(mapId).create, (create) => async () => {
        await commandOutcomes.run('graph-create', create);
        return false;
      }),
      // Asked first, in the words the Dock's Delete Graph asks. Graph
      // authoring waits for both Spaces, repoints every Space Resource that
      // selected the Graph — this one included — and leaves the target's
      // canvas on the survivor; the target holds a refusal or a
      // break.
      onDelete: offered(addressedGraph.delete, (remove) => (focusFallback: FocusFallback) => {
        deleteConfirmation.arm({
          ...graphDeletionWords(graph, targetMap),
          run: async () => {
            await commandOutcomes.run('graph-delete', remove);
          },
          focusFallback,
        });
      }),
      onCopyLink: () =>
        copyLink(location.href({ kind: 'map-graph', spaceId: entry.id, mapId, graphId })),
    },
  };
}
