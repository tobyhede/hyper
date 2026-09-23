import type { ResourceDocument, GraphId, UUID } from '@project/core';
import type { CanvasSpaceResourceCommands, CanvasSpaceResourceGraphCommands } from '@project/ui';
import type { CommandOutcomes } from './command-outcomes';
import type { Continuation } from './continuation';
import { copyLink } from './clipboard';
import { GRAPH_PALETTE_ENTRIES, GRAPH_PALETTE } from './colors';
import { describeAuthoringRefusal } from './authoring-refusal';
import { coordinatedGraphDelete, PERSISTENCE_UNSETTLED } from './coordinated-context-delete';
import { coordinatedContextCreate } from './coordinated-context-create';
import { embeddedMapAuthoringCommands, renameDraftAnswer } from './map-authoring-commands';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';

const refusalOf = (result: AuthoringResult): string | null =>
  result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;

interface SpaceResourceContextCommands {
  readonly mapCommands: CanvasSpaceResourceCommands;
  readonly graphCommands?: CanvasSpaceResourceGraphCommands;
}

/** The target an Open Space Resource embeds, and what its rail's commands report into. */
export interface SpaceResourceRailContext {
  readonly entry: OpenSpace;
  readonly spaces: OpenSpaces;
  readonly containingSpaceId: UUID;
  readonly continuation: Continuation;
  /** The containing canvas's, where a Map report from this rail is held. */
  readonly commandOutcomes: CommandOutcomes;
  readonly complete: (
    completion: Exclude<EmbeddedContextCompletion, { kind: 'deleted-graph' }>,
  ) => AuthoringResult;
}

/** The Dock commands, addressed to the target and the context this Resource stores. */
export function spaceResourceContextCommands(
  {
    entry,
    spaces,
    containingSpaceId,
    continuation,
    complete,
    commandOutcomes,
  }: SpaceResourceRailContext,
  document: Extract<ResourceDocument, { kind: 'space' }>,
  select: (map: Pick<SpaceResourceTargetMap, 'id'>, graphId: GraphId) => string | null,
  available: () => boolean,
): SpaceResourceContextCommands {
  // The rail's own answer, asked again when a command is pressed.
  const mapAuthoring = embeddedMapAuthoringCommands({
    target: entry,
    spaces,
    containingSpaceId,
    select: (mapId, graphId) => select({ id: mapId }, graphId),
    available,
  });
  const location = spaces.browserLocation;
  const settled = async () =>
    (await spaces.waitForPersistence(entry.id)) &&
    (await spaces.waitForPersistence(containingSpaceId));
  const selectAndSave = async (next: Pick<SpaceResourceTargetMap, 'id'>, nextGraph: GraphId) => {
    const refusal = select(next, nextGraph);
    if (refusal !== null) return refusal;
    return (await spaces.waitForPersistence(containingSpaceId)) ? null : PERSISTENCE_UNSETTLED;
  };
  const { map: mapId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const map = space.maps.find((each) => each.id === mapId);
  const graph = map?.graphs.find((each) => each.id === graphId);
  const mapCommands: CanvasSpaceResourceCommands = {
    // Map authoring's answer, the last Map and a Map that has gone included.
    deleteDisabled: !mapAuthoring.map(mapId).delete.available,
    // The containing canvas's command outcomes hold the report: the notice
    // is drawn by the Space the author is looking at, not by the target.
    onRename: (title) =>
      renameDraftAnswer(
        commandOutcomes.run('map-manage', () => mapAuthoring.map(mapId).rename.invoke(title)),
      ),
    // Map authoring orders the creation and the selection write, and the
    // containing canvas holds its report; where the caret goes is this rail's.
    onCreate: async (scope) => {
      const outcome = await commandOutcomes.run('map-create', () => mapAuthoring.create.invoke());
      if (outcome.kind === 'completed') {
        continuation.request({
          target: {
            kind: 'control',
            name: 'map-name',
            scope: { id: scope, subject: outcome.mapId },
          },
          select: false,
          then: 'rename',
        });
      }
      return outcome.kind === 'refused' ? outcome.report.message : null;
    },
    // Map authoring waits for both Spaces, repoints every Space Resource that
    // selected the Map — this one included — and leaves the target's canvas
    // on the survivor; the containing canvas holds a refusal.
    onDelete: async () => {
      const outcome = await commandOutcomes.run('map-delete', () =>
        mapAuthoring.map(mapId).delete.invoke(),
      );
      return outcome.kind === 'refused' ? outcome.report.message : null;
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
