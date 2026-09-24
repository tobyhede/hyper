import type { GraphId, ResourceDocument } from '@project/core';
import { SpaceResourceSelectors, type SpaceResourceSelectorsProps } from '@project/ui';
import {
  spaceResourceContextCommands,
  type SpaceResourceRailContext,
} from './space-resource-context-commands';
import type { SpaceResourceTarget, SpaceResourceTargetMap } from './space-resource-lifecycle';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The two lists an Open Space Resource chooses from, the commands that act on
 * them, and the rail fragment that draws both.
 *
 * Built here rather than in the decoration layer because the pairing is a
 * domain rule: the Graphs offered are the selected Map's alone, so a Resource
 * whose stored Map has since been deleted offers no Graphs rather than the
 * previous Map's (ADR 0040, ADR 0068). Context commands stay sourced from
 * {@link spaceResourceContextCommands}.
 */
export interface BuildSpaceResourceRailInput {
  readonly target: SpaceResourceTarget;
  readonly document: Extract<ResourceDocument, { kind: 'space' }> | undefined;
  readonly disabled: boolean;
  readonly complete: (map: Pick<SpaceResourceTargetMap, 'id'>, graphId: GraphId) => string | null;
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onReport: (message: string | null) => void;
  readonly context: SpaceResourceRailContext | undefined;
}

export function buildSpaceResourceRail({
  target,
  document,
  disabled,
  complete,
  onEditingChange,
  onReport,
  context,
}: BuildSpaceResourceRailInput) {
  const selectedMap = target.maps.find((map) => map.id === document?.map);
  const mapOf = (id: string): SpaceResourceTargetMap | undefined =>
    target.maps.find((map) => map.id === id);
  const commands =
    context === undefined || document === undefined
      ? undefined
      : spaceResourceContextCommands(context, document, complete, () => !disabled);
  const optional: Mutable<
    Pick<SpaceResourceSelectorsProps, 'onEditingChange' | 'mapCommands' | 'graphCommands'>
  > = {};
  if (onEditingChange !== undefined) optional.onEditingChange = onEditingChange;
  if (commands !== undefined) {
    optional.mapCommands = commands.mapCommands;
    if (commands.graphCommands !== undefined) optional.graphCommands = commands.graphCommands;
  }
  return (
    <SpaceResourceSelectors
      onReport={onReport}
      maps={target.maps.map(({ id, title }) => ({ id, title }))}
      graphs={(selectedMap?.graphs ?? []).map(({ id, title, color }) => ({ id, title, color }))}
      mapId={selectedMap?.id ?? null}
      graphId={
        selectedMap?.graphs.some((graph) => graph.id === document?.graph)
          ? (document?.graph ?? null)
          : null
      }
      onMapChange={(id) => {
        const map = mapOf(id);
        // The Map's own Active Graph, and the head of its list only where it
        // has authored none — which is what an absent `activeGraph` means
        // (ADR 0026). Resolved against the Map's Graphs rather than trusted:
        // the seed has to be a Graph this Map owns or the aggregate refuses
        // the Resource that names it.
        if (map === undefined) return;
        const seed = map.graphs.find((graph) => graph.id === map.activeGraph) ?? map.graphs[0];
        // A Map owns at least one Graph, so this is the type-level boundary
        // between a validated Space and the ids read out of it, not a Map an
        // author can choose and leave half-selected.
        if (seed === undefined) return;
        complete(map, seed.id);
      }}
      onGraphChange={(id) => {
        if (selectedMap === undefined) return;
        const graph = selectedMap.graphs.find((candidate) => candidate.id === id);
        if (graph !== undefined) complete(selectedMap, graph.id);
      }}
      disabled={disabled}
      {...optional}
    />
  );
}
