import type { GraphId, ThingDocument, UUID } from '@project/core';
import { SpaceThingSelectors, type SpaceThingSelectorsProps } from '@project/ui';
import type { Continuation } from './continuation';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import { spaceThingContextCommands } from './space-thing-context-commands';
import type { AuthoringResult, EmbeddedContextCompletion } from './space-authoring';
import type { SpaceThingTarget, SpaceThingTargetDiagram } from './space-thing-lifecycle';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface SpaceThingRailContext {
  readonly entry: OpenSpace;
  readonly spaces: OpenSpaces;
  readonly containingSpaceId: UUID;
  readonly continuation: Continuation;
  readonly complete: (
    completion: Exclude<EmbeddedContextCompletion, { kind: 'deleted-graph' }>,
  ) => AuthoringResult;
}

/**
 * The two lists an Open Space Thing chooses from, the commands that act on
 * them, and the rail fragment that draws both.
 *
 * Built here rather than in the decoration layer because the pairing is a
 * domain rule: the Graphs offered are the selected Diagram's alone, so a Thing
 * whose stored Diagram has since been deleted offers no Graphs rather than the
 * previous Diagram's (ADR 0040, ADR 0068). Context commands stay sourced from
 * {@link spaceThingContextCommands}.
 */
export interface BuildSpaceThingRailInput {
  readonly target: SpaceThingTarget;
  readonly document: Extract<ThingDocument, { kind: 'space' }> | undefined;
  readonly disabled: boolean;
  readonly complete: (
    diagram: Pick<SpaceThingTargetDiagram, 'id'>,
    graphId: GraphId,
  ) => string | null;
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onReport: (message: string | null) => void;
  readonly context: SpaceThingRailContext | undefined;
}

export function buildSpaceThingRail({
  target,
  document,
  disabled,
  complete,
  onEditingChange,
  onReport,
  context,
}: BuildSpaceThingRailInput) {
  const selectedDiagram = target.diagrams.find((diagram) => diagram.id === document?.diagram);
  const diagramOf = (id: string): SpaceThingTargetDiagram | undefined =>
    target.diagrams.find((diagram) => diagram.id === id);
  const commands =
    context === undefined || document === undefined
      ? undefined
      : spaceThingContextCommands(
          context.entry,
          context.spaces,
          context.containingSpaceId,
          document,
          complete,
          context.continuation,
          context.complete,
        );
  const optional: Mutable<
    Pick<SpaceThingSelectorsProps, 'onEditingChange' | 'diagramCommands' | 'graphCommands'>
  > = {};
  if (onEditingChange !== undefined) optional.onEditingChange = onEditingChange;
  if (commands !== undefined) {
    optional.diagramCommands = commands.diagramCommands;
    if (commands.graphCommands !== undefined) optional.graphCommands = commands.graphCommands;
  }
  return (
    <SpaceThingSelectors
      onReport={onReport}
      diagrams={target.diagrams.map(({ id, title }) => ({ id, title }))}
      graphs={(selectedDiagram?.graphs ?? []).map(({ id, title }) => ({ id, title }))}
      diagramId={selectedDiagram?.id ?? null}
      graphId={
        selectedDiagram?.graphs.some((graph) => graph.id === document?.graph)
          ? (document?.graph ?? null)
          : null
      }
      onDiagramChange={(id) => {
        const diagram = diagramOf(id);
        // The Diagram's own Active Graph, and the head of its list only where it
        // has authored none — which is what an absent `activeGraph` means
        // (ADR 0026). Resolved against the Diagram's Graphs rather than trusted:
        // the seed has to be a Graph this Diagram owns or the aggregate refuses
        // the Thing that names it.
        if (diagram === undefined) return;
        const seed =
          diagram.graphs.find((graph) => graph.id === diagram.activeGraph) ?? diagram.graphs[0];
        // A Diagram owns at least one Graph, so this is the type-level boundary
        // between a validated Space and the ids read out of it, not a Diagram an
        // author can choose and leave half-selected.
        if (seed === undefined) return;
        complete(diagram, seed.id);
      }}
      onGraphChange={(id) => {
        if (selectedDiagram === undefined) return;
        const graph = selectedDiagram.graphs.find((candidate) => candidate.id === id);
        if (graph !== undefined) complete(selectedDiagram, graph.id);
      }}
      disabled={disabled}
      {...optional}
    />
  );
}
