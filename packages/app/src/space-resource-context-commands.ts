import type { ResourceDocument, GraphId, UUID } from '@project/core';
import type { CanvasSpaceEndpointCommands, CanvasSpaceEndpointGraphCommands } from '@project/ui';
import type { Continuation } from './continuation';
import { copyLink } from './clipboard';
import { GRAPH_PALETTE_ENTRIES, GRAPH_PALETTE } from './colors';
import { describeAuthoringRefusal } from './authoring-refusal';
import {
  coordinatedMapDelete,
  coordinatedGraphDelete,
  PERSISTENCE_UNSETTLED,
} from './coordinated-context-delete';
import { coordinatedContextCreate, createdMapContext } from './coordinated-context-create';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceEndpointTargetMap } from './space-resource-lifecycle';

const refusalOf = (result: AuthoringResult): string | null =>
  result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;

interface SpaceEndpointContextCommands {
  readonly mapCommands: CanvasSpaceEndpointCommands;
  readonly graphCommands?: CanvasSpaceEndpointGraphCommands;
}

/** The Dock commands, addressed to the target and the context this Resource stores. */
export function spaceResourceContextCommands(
  entry: OpenSpace,
  spaces: OpenSpaces,
  containingSpaceId: UUID,
  document: Extract<ResourceDocument, { kind: 'space' }>,
  select: (map: Pick<SpaceEndpointTargetMap, 'id'>, graphId: GraphId) => string | null,
  continuation: Continuation,
  complete: (
    completion: Exclude<EmbeddedContextCompletion, { kind: 'deleted-graph' }>,
  ) => AuthoringResult,
): SpaceEndpointContextCommands {
  const location = spaces.browserLocation;
  const settled = async () =>
    (await spaces.waitForPersistence(entry.id)) &&
    (await spaces.waitForPersistence(containingSpaceId));
  const selectAndSave = async (next: Pick<SpaceEndpointTargetMap, 'id'>, nextGraph: GraphId) => {
    const refusal = select(next, nextGraph);
    if (refusal !== null) return refusal;
    return (await spaces.waitForPersistence(containingSpaceId)) ? null : PERSISTENCE_UNSETTLED;
  };
  const { map: mapId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const map = space.maps.find((each) => each.id === mapId);
  const graph = map?.graphs.find((each) => each.id === graphId);
  const mapCommands: CanvasSpaceEndpointCommands = {
    deleteDisabled: space.maps.length <= 1 || map === undefined,
    onRename: (title) => refusalOf(complete({ kind: 'renamed-map', mapId, title })),
    onCreate: async (scope) =>
      coordinatedContextCreate({
        waitBefore: settled,
        create: () => entry.app.authoring.complete({ kind: 'created-map' }),
        waitUntilPersisted: () => spaces.waitForPersistence(entry.id),
        createdOf: () =>
          createdMapContext(
            entry.app.currentSpace().maps,
            entry.app.navigation.getState().selectedMapId,
          ),
        afterCreated: async (created, active) => {
          const refusal = await selectAndSave(created, active);
          if (refusal !== null) return refusal;
          continuation.request({
            target: {
              kind: 'control',
              name: 'map-name',
              scope: { id: scope, subject: created.id },
            },
            select: false,
            then: 'rename',
          });
          return null;
        },
      }),
    onDelete: async () => {
      const selected = entry.app.navigation.getState().selectedMapId;
      const result = await coordinatedMapDelete(
        entry.spaceResources.deleteMap,
        {
          targetSpaceId: entry.id,
          mapId,
          preferredMapId: selected,
        },
        settled,
      );
      if (result.kind === 'error') return result.message;
      if (result.kind === 'completed' && entry.app.navigation.getState().selectedMapId === mapId) {
        entry.app.navigation.selectMap(result.mapId);
        entry.app.navigation.activateGraph(result.graphId);
      }
      return null;
    },
    onCopyLink: () => copyLink(location.href({ kind: 'map', spaceId: entry.id, mapId })),
  };
  if (map === undefined || graph === undefined) return { mapCommands };
  return {
    mapCommands,
    graphCommands: {
      deleteDisabled: map.graphs.length <= 1,
      color: graph.color ?? GRAPH_PALETTE[0],
      colors: GRAPH_PALETTE_ENTRIES,
      onRename: (title) => refusalOf(complete({ kind: 'renamed-graph', graphId, title })),
      onRecolor: (color) => refusalOf(complete({ kind: 'recolored-graph', graphId, color })),
      onCreate: async () =>
        coordinatedContextCreate({
          waitBefore: settled,
          create: () => complete({ kind: 'added-graph' }),
          waitUntilPersisted: () => spaces.waitForPersistence(entry.id),
          createdOf: (result) => {
            const updated = entry.app.currentSpace().maps.find((each) => each.id === mapId);
            return result.createdGraphId !== undefined && updated !== undefined
              ? { created: updated, active: result.createdGraphId }
              : undefined;
          },
          afterCreated: selectAndSave,
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
