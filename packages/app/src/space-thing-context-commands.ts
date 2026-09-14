import type { ThingDocument, GraphId, UUID } from '@project/core';
import type { CanvasSpaceThingCommands, CanvasSpaceThingGraphCommands } from '@project/ui';
import type { Continuation } from './continuation';
import { copyLink } from './clipboard';
import { GRAPH_COLORS, GRAPH_PALETTE } from './colors';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceThingTargetDiagram } from './space-thing-lifecycle';

const refusalOf = (result: AuthoringResult): string | null =>
  result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;

/** The Dock commands, addressed to the target and the context this Thing stores. */
export function spaceThingContextCommands(
  entry: OpenSpace,
  spaces: OpenSpaces,
  containingSpaceId: UUID,
  document: Extract<ThingDocument, { kind: 'space' }>,
  select: (diagram: Pick<SpaceThingTargetDiagram, 'id'>, graphId: GraphId) => string | null,
  continuation: Continuation,
): { diagramCommands: CanvasSpaceThingCommands; graphCommands?: CanvasSpaceThingGraphCommands } {
  const location = spaces.browserLocation;
  const persistenceError = 'The change could not be saved. Check the Space persistence status.';
  const settled = async () =>
    (await spaces.waitForPersistence(entry.id)) &&
    (await spaces.waitForPersistence(containingSpaceId));
  const selectAndSave = async (next: Pick<SpaceThingTargetDiagram, 'id'>, nextGraph: GraphId) => {
    const refusal = select(next, nextGraph);
    if (refusal !== null) return refusal;
    return (await spaces.waitForPersistence(containingSpaceId)) ? null : persistenceError;
  };
  const { diagram: diagramId, graph: graphId } = document;
  const space = entry.app.currentSpace();
  const diagram = space.diagrams.find((each) => each.id === diagramId);
  const graph = diagram?.graphs.find((each) => each.id === graphId);
  const complete = (completion: EmbeddedContextCompletion) =>
    entry.app.authoring.completeInDiagram(diagramId, completion);
  const diagramCommands: CanvasSpaceThingCommands = {
    deleteDisabled: space.diagrams.length <= 1 || diagram === undefined,
    onRename: (title) => refusalOf(complete({ kind: 'renamed-diagram', diagramId, title })),
    onCreate: async (scope) => {
      if (!(await settled())) return persistenceError;
      const result = entry.app.authoring.complete({ kind: 'created-diagram' });
      if (result.kind === 'completed') {
        if (!(await spaces.waitForPersistence(entry.id))) return persistenceError;
        const selected = entry.app.navigation.getState().selectedDiagramId;
        const created = entry.app.currentSpace().diagrams.find((each) => each.id === selected);
        const active = created?.activeGraph ?? created?.graphs[0]?.id;
        if (created !== undefined && active !== undefined) {
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
        }
      }
      return refusalOf(result);
    },
    onDelete: async () => {
      if (!(await settled())) return persistenceError;
      const next = entry.app.currentSpace().diagrams.find((each) => each.id !== diagramId);
      const active = next?.activeGraph ?? next?.graphs[0]?.id;
      if (next !== undefined && active !== undefined) {
        const refusal = await selectAndSave(next, active);
        if (refusal !== null) return refusal;
      }
      const result = entry.app.authoring.complete({ kind: 'deleted-diagram', diagramId });
      return (
        refusalOf(result) ?? ((await spaces.waitForPersistence(entry.id)) ? null : persistenceError)
      );
    },
    onCopyLink: () => copyLink(location.href({ kind: 'diagram', spaceId: entry.id, diagramId })),
  };
  if (diagram === undefined || graph === undefined) return { diagramCommands };
  return {
    diagramCommands,
    graphCommands: {
      deleteDisabled: diagram.graphs.length <= 1,
      color: graph.color ?? GRAPH_PALETTE[0],
      colors: GRAPH_COLORS,
      onRename: (title) => refusalOf(complete({ kind: 'renamed-graph', graphId, title })),
      onRecolor: (color) => refusalOf(complete({ kind: 'recolored-graph', graphId, color })),
      onCreate: async () => {
        if (!(await settled())) return persistenceError;
        const result = complete({ kind: 'added-graph' });
        if (result.kind === 'completed' && !(await spaces.waitForPersistence(entry.id)))
          return persistenceError;
        const updated = entry.app.currentSpace().diagrams.find((each) => each.id === diagramId);
        if (
          result.kind === 'completed' &&
          result.createdGraphId !== undefined &&
          updated !== undefined
        )
          return selectAndSave(updated, result.createdGraphId);
        return refusalOf(result);
      },
      onDelete: async () => {
        if (!(await settled())) return persistenceError;
        const updated = entry.app.currentSpace().diagrams.find((each) => each.id === diagramId);
        const survivor = updated?.graphs.find((each) => each.id !== graphId);
        if (updated !== undefined && survivor !== undefined) {
          const refusal = await selectAndSave(updated, survivor.id);
          if (refusal !== null) return refusal;
        }
        const result = complete({ kind: 'deleted-graph', graphId });
        return (
          refusalOf(result) ??
          ((await spaces.waitForPersistence(entry.id)) ? null : persistenceError)
        );
      },
      onCopyLink: () =>
        copyLink(location.href({ kind: 'diagram-graph', spaceId: entry.id, diagramId, graphId })),
      onCopyPermanentLink: () =>
        copyLink(location.href({ kind: 'graph', spaceId: entry.id, graphId })),
    },
  };
}
