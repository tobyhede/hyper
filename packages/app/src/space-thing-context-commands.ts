import type { ThingDocument, GraphId, UUID } from '@project/core';
import type { CanvasSpaceThingCommands, CanvasSpaceThingGraphCommands } from './space-thing-rail';
import type { Continuation } from './continuation';
import { copyLink } from './clipboard';
import { GRAPH_PALETTE_ENTRIES, GRAPH_PALETTE } from './colors';
import { describeAuthoringRefusal } from './authoring-refusal';
import {
  coordinatedDiagramDelete,
  coordinatedGraphDelete,
  PERSISTENCE_UNSETTLED,
} from './coordinated-context-delete';
import { coordinatedContextCreate, createdDiagramContext } from './coordinated-context-create';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceThingTargetDiagram } from './space-thing-lifecycle';

const refusalOf = (result: AuthoringResult): string | null =>
  result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;

interface SpaceThingContextCommands {
  readonly diagramCommands: CanvasSpaceThingCommands;
  readonly graphCommands?: CanvasSpaceThingGraphCommands;
}

/** The Dock commands, addressed to the target and the context this Thing stores. */
export function spaceThingContextCommands(
  entry: OpenSpace,
  spaces: OpenSpaces,
  containingSpaceId: UUID,
  document: Extract<ThingDocument, { kind: 'space' }>,
  select: (diagram: Pick<SpaceThingTargetDiagram, 'id'>, graphId: GraphId) => string | null,
  continuation: Continuation,
  complete: (
    completion: Exclude<EmbeddedContextCompletion, { kind: 'deleted-graph' }>,
  ) => AuthoringResult,
): SpaceThingContextCommands {
  const location = spaces.browserLocation;
  const settled = async () =>
    (await spaces.waitForPersistence(entry.id)) &&
    (await spaces.waitForPersistence(containingSpaceId));
  const selectAndSave = async (next: Pick<SpaceThingTargetDiagram, 'id'>, nextGraph: GraphId) => {
    const refusal = select(next, nextGraph);
    if (refusal !== null) return refusal;
    return (await spaces.waitForPersistence(containingSpaceId)) ? null : PERSISTENCE_UNSETTLED;
  };
  const { diagram: diagramId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const diagram = space.diagrams.find((each) => each.id === diagramId);
  const graph = diagram?.graphs.find((each) => each.id === graphId);
  const diagramCommands: CanvasSpaceThingCommands = {
    deleteDisabled: space.diagrams.length <= 1 || diagram === undefined,
    onRename: (title) => refusalOf(complete({ kind: 'renamed-diagram', diagramId, title })),
    onCreate: async (scope) =>
      coordinatedContextCreate({
        waitBefore: settled,
        create: () => entry.app.authoring.complete({ kind: 'created-diagram' }),
        waitUntilPersisted: () => spaces.waitForPersistence(entry.id),
        createdOf: () =>
          createdDiagramContext(
            entry.app.currentSpace().diagrams,
            entry.app.navigation.getState().selectedDiagramId,
          ),
        afterCreated: async (created, active) => {
          const refusal = await selectAndSave(created, active);
          if (refusal !== null) return refusal;
          continuation.request({
            target: {
              kind: 'control',
              name: 'diagram-name',
              scope: { id: scope, subject: created.id },
            },
            select: false,
            then: 'rename',
          });
          return null;
        },
      }),
    onDelete: async () => {
      const selected = entry.app.navigation.getState().selectedDiagramId;
      const result = await coordinatedDiagramDelete(
        entry.spaceThings.deleteDiagram,
        {
          targetSpaceId: entry.id,
          diagramId,
          preferredDiagramId: selected,
        },
        settled,
      );
      if (result.kind === 'error') return result.message;
      if (
        result.kind === 'completed' &&
        entry.app.navigation.getState().selectedDiagramId === diagramId
      ) {
        entry.app.navigation.selectDiagram(result.diagramId);
        entry.app.navigation.activateGraph(result.graphId);
      }
      return null;
    },
    onCopyLink: () => copyLink(location.href({ kind: 'diagram', spaceId: entry.id, diagramId })),
  };
  if (diagram === undefined || graph === undefined) return { diagramCommands };
  return {
    diagramCommands,
    graphCommands: {
      deleteDisabled: diagram.graphs.length <= 1,
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
            const updated = entry.app.currentSpace().diagrams.find((each) => each.id === diagramId);
            return result.createdGraphId !== undefined && updated !== undefined
              ? { created: updated, active: result.createdGraphId }
              : undefined;
          },
          afterCreated: selectAndSave,
        }),
      onDelete: async () => {
        const updated = entry.app.currentSpace().diagrams.find((each) => each.id === diagramId);
        const result = await coordinatedGraphDelete(
          entry.spaceThings.deleteGraph,
          {
            targetSpaceId: entry.id,
            diagramId,
            graphId,
            preferredGraphId: updated?.activeGraph ?? null,
          },
          settled,
        );
        if (result.kind === 'error') return result.message;
        if (
          result.kind === 'completed' &&
          entry.app.navigation.getState().selectedDiagramId === diagramId
        )
          entry.app.navigation.activateGraph(result.graphId);
        return null;
      },
      onCopyLink: () =>
        copyLink(location.href({ kind: 'diagram-graph', spaceId: entry.id, diagramId, graphId })),
      onCopyPermanentLink: () =>
        copyLink(location.href({ kind: 'graph', spaceId: entry.id, graphId })),
    },
  };
}
