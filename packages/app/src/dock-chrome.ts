import { useCallback, useMemo, useRef, useState } from 'react';
import type { Graph, GraphId, Map as SpaceMap, Resource, ResourceId, UUID } from '@project/core';
import type { Space } from '@project/graph';
import type { ObserverErrorReporter, SpaceSessionState } from '@project/persistence';
import { FALLBACK_GRAPH_COLOR, type EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { BrowserLocation } from './browser-location';
import type { PendingCanvasProjection } from './canvas-projection';
import type {
  DockChrome,
  DockResourceKind,
  DockResourcesList,
  SpaceExitReport,
} from './components/command-dock-chrome';
import { coordinatedGraphDelete } from './coordinated-context-delete';
import {
  COPY_LINK_ACTION_ID,
  type EntityCommandId,
  type SpaceChromeTitleSubject,
  type SpaceEntity,
} from './entity-actions';
import { offered, renameDraftAnswer, topLevelMapAuthoringCommands } from './map-authoring-commands';
import type { OpenSpace, OpenSpaces, RejectedExitConfirmation } from './open-spaces';
import type { ResourcePlacementCommands } from './resource-placement';
import type { ResourcesDisclosure } from './resources-disclosure';
import { useReferenceableSpaces } from './referenceable-spaces';
import type { AuthoringResult } from './space-authoring';

/**
 * The Graph the Dock's Graph cluster names: the Active Graph, or nothing.
 *
 * A Map always owns at least one Graph — ADR 0079 mints one with every Map and
 * Authoring refuses the Edit that would empty it — but the type does not say
 * so, and a surface that asserted it would be asserting a domain rule from the
 * outside. `null` is drawn as no Dock at all, the same answer the canvas gives
 * for a Map it cannot resolve.
 *
 * **There is no falling back to the first visible Graph.** The Dock passes the
 * named Graph to Delete, Rename and Recolor, so a fallback would aim those at a
 * Graph the canvas is not drawing as active. The Dock reads exactly what the
 * canvas reads; a Navigation that names a Graph the Map no longer owns is
 * repaired where it arises (`space-authoring.ts`'s `reconcileNavigation`,
 * `active-graph-after-coordinated-recovery.test.ts`).
 */
export const activeGraphOf = (
  visibleGraphs: readonly Graph[],
  activeGraphId: GraphId | null,
): Graph | null => visibleGraphs.find((graph) => graph.id === activeGraphId) ?? null;

/** What the Resources cluster offers and what its rows do. */
export interface DockResourcesInput {
  /** The Resources the drawn Map leaves out. */
  readonly outside: readonly Resource[];
  readonly memberships: DockResourcesList['memberships'];
  readonly spaceTitleById: DockResourcesList['spaceTitleById'];
  readonly disclose: ResourcesDisclosure | null;
  readonly addressedResourceId: ResourceId | null;
  readonly placement: ResourcePlacementCommands;
}

export interface DockChromeInput {
  readonly space: Space;
  readonly map: SpaceMap;
  readonly projection: Pick<PendingCanvasProjection, 'visibleGraphs' | 'colors'>;
  readonly activeGraphId: GraphId | null;
  readonly presenting: boolean;
  /** Whether this Space is the one on the canvas. */
  readonly active: boolean;
  readonly persistence: SpaceSessionState['persistence'];
  readonly replacementEpoch: number;
  readonly availability: AuthoringAvailability;
  /** Reported while one of the Dock's names is being renamed in place. */
  readonly onRenamingChange: (renaming: boolean) => void;
  readonly entityActions: (entity: SpaceEntity) => readonly EntityActionGroup[];
  readonly spaces: OpenSpaces | null;
  readonly resources: DockResourcesInput;
  /** The containing Space's id, read when the referenceable Spaces are. */
  readonly containingSpaceId: () => UUID;
  readonly reportBreak: ObserverErrorReporter;
}

export interface DockChromeState {
  /** What the Command Dock draws, or `null` while there is no Active Graph to name. */
  readonly chrome: DockChrome | null;
  /** Spent by the chrome continuation when New Map's rename continuation lands. */
  readonly onChromeContinuationLand: () => void;
}

/**
 * Everything the Command Dock draws and every command it runs, for the Space on
 * this canvas — the Spaces its Resources list offers among them.
 *
 * Built each render rather than memoized: the availability answers it carries
 * are React state, so the capability the Dock draws a row from and the one it
 * invokes read the same render.
 */
export function useDockChrome(
  open: OpenSpace,
  location: Pick<BrowserLocation, 'chooseMap' | 'activateGraph'>,
  input: DockChromeInput,
): DockChromeState {
  const { app, spaceResources } = open;
  const { authoring, commandOutcomes, navigation } = app;
  const {
    space,
    map,
    projection,
    activeGraphId,
    presenting,
    active,
    persistence,
    replacementEpoch,
    availability,
    onRenamingChange,
    entityActions,
    spaces,
    resources,
    containingSpaceId,
    reportBreak,
  } = input;
  const referenceableSpaces = useReferenceableSpaces(
    active,
    spaceResources,
    containingSpaceId,
    reportBreak,
  );

  /** Set when New Map's chrome rename continuation actually lands. */
  const createMapMovedCaret = useRef(false);
  const onChromeContinuationLand = useCallback(() => {
    createMapMovedCaret.current = true;
  }, []);

  /**
   * Map Edits on the Space the canvas draws: rename while a chrome command may
   * run, creation while Add Map may, and deletion while entity Edits may.
   * Rebuilt when any answer moves.
   */
  const { chromeTitleEdit, createMap, entityEdits } = availability;
  const mapAuthoring = useMemo(
    () =>
      topLevelMapAuthoringCommands(
        { app, spaceResources },
        {
          rename: () => chromeTitleEdit,
          create: () => createMap,
          delete: () => entityEdits,
        },
      ),
    [app, spaceResources, chromeTitleEdit, createMap, entityEdits],
  );

  /**
   * A Space or Graph rename from the Dock; a Map's goes through `mapAuthoring`.
   *
   * The editor holds a refused draft open, so this answers the refusal's
   * sentence, and `null` for an Edit that landed. `unchanged` is `null` too: a
   * title the subject already has is the value the author already authored.
   */
  const renameChromeTitle = useCallback(
    (subject: Exclude<SpaceChromeTitleSubject, { kind: 'map' }>, title: string): string | null => {
      const result =
        subject.kind === 'space'
          ? // No id: the Edit writes `document.title` on the session this
            // composition is closed over, which is the Space the Dock draws.
            authoring.complete({ kind: 'renamed-space', title })
          : authoring.complete({ kind: 'renamed-graph', graphId: subject.id, title });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    },
    [authoring],
  );

  const [exitReport, setExitReport] = useState<SpaceExitReport | null>(null);
  /** The Space an exit is in flight over, or `null`. */
  const [exiting, setExiting] = useState<UUID | null>(null);
  /**
   * Exiting a Space, and the two ways it does not happen.
   *
   * The lifecycle is `openSpaces.exit`'s and this only draws it: `warning` is
   * the rejected-work question ADR 0068 makes Exit permit, answered by handing
   * the same `RejectedExitConfirmation` token back; `refused` names the recovery
   * the Space already has. `exited` reports nothing — the Space is gone from the
   * Open Spaces menu and the canvas has moved.
   *
   * One attempt at a time, and the previous answer goes with the new attempt:
   * `exit` waits on an in-flight commit, so a second press during that wait
   * would start a second run over an entry the first has not finished with.
   *
   * The title travels on the report because by the time it is drawn the Space
   * it names may no longer be the one on the canvas (ADR 0082).
   */
  const exitSpace = useCallback(
    (spaceId: UUID, confirmation?: RejectedExitConfirmation): void => {
      if (spaces === null) return;
      if (exiting !== null) return;
      const title = spaces.entry(spaceId)?.session.getState().working.document.title ?? space.title;
      setExiting(spaceId);
      setExitReport(null);
      void commandOutcomes
        .run('space-exit', async () => spaces.exit(spaceId, confirmation), { subject: title })
        .then((result) => {
          switch (result.kind) {
            case 'warning':
            case 'refused':
              setExitReport({ spaceId, title, outcome: result });
              return;
            // A discarded exit has nothing to say, and a broken one is the
            // standing notice's.
            case 'exited':
            case 'broke':
            case 'discarded':
              return;
          }
        })
        .finally(() => setExiting(null));
    },
    [spaces, space.title, exiting, commandOutcomes],
  );

  const activeGraph = activeGraphOf(projection.visibleGraphs, activeGraphId);
  if (activeGraph === null) return { chrome: null, onChromeContinuationLand };

  /**
   * One command out of an entity's own menu, spent by a cluster that draws its
   * own. *Which* address each entity offers is decided once, in
   * `entity-actions.tsx`; reading that decision out by id keeps the two
   * surfaces from disagreeing about what "Copy link" means. An id the entity
   * does not offer is simply absent.
   */
  const runEntityCommand = (entity: SpaceEntity, id: EntityCommandId) => () => {
    void entityActions(entity)
      .flat()
      .find((action) => action.id === id)
      ?.onSelect(null);
  };
  /** A Graph Edit from the cluster, reported on `graph-edit`. */
  const runGraphEdit = (operation: () => AuthoringResult): void => {
    commandOutcomes.run('graph-edit', operation);
  };
  const { placement } = resources;
  const { centreAnchor } = placement;

  const chrome: DockChrome = {
    onRenamingChange,
    // ADR 0042's epoch, handed down rather than acted on here: the editor a
    // replacement discards is a name control's own.
    replacementEpoch,
    space: {
      title: space.title,
      currentSpaceId: space.id,
      opener: spaces?.opener(space.id) ?? null,
      listing: spaces?.listing() ?? [],
      // Behind `chromeTitleEdit` exactly as the Map and Graph names are: all
      // three are withdrawn together while something else owns the caret or the
      // canvas has no placement to edit against.
      onRename: availability.chromeTitleEdit
        ? (title) => renameChromeTitle({ kind: 'space' }, title)
        : null,
      onCopyLink: runEntityCommand({ kind: 'space' }, COPY_LINK_ACTION_ID),
      // Named by the title the Dock drew for the row: neither `select`'s own
      // refusal nor a thrown load failure carries one.
      onSelect: (spaceId, title) => {
        if (spaces === null) return;
        void commandOutcomes.run('space-open', async () => spaces.select(spaceId), {
          subject: title,
        });
      },
      onExit: exitSpace,
      // `openSpaces.exit`'s own rule, asked of the aggregate that enforces it.
      // With no session there is nothing to exit into, so the command is
      // unavailable rather than absent.
      exitDisabled: spaces === null || space.id === spaces.metaSpaceId || exiting !== null,
      exitReport,
      onDismissExitReport: () => setExitReport(null),
    },
    canvas: {
      maps: space.maps,
      selected: map,
      onSelect: location.chooseMap,
      // Each Map command is the press built from the capability that answers
      // its availability (`offered`), so the Dock draws a row unavailable
      // exactly when invoking it would answer so — the last Map included.
      onRename: offered(
        mapAuthoring.map(map.id).rename,
        (rename) => (title: string) =>
          renameDraftAnswer(commandOutcomes.run('map-manage', () => rename(title))),
      ),
      // One Edit creates and selects an empty Map with its one empty Graph
      // (ADR 0079), and the caret continues in its name.
      onCreate: offered(mapAuthoring.create, (create) => () => {
        createMapMovedCaret.current = false;
        void commandOutcomes.run('map-create', create, {
          completionMovesMap: true,
          continueAt: () => ({
            target: { kind: 'control', name: 'map-name' },
            select: false,
            then: 'rename',
          }),
        });
      }),
      didCreateMoveCaret: () => createMapMovedCaret.current,
      // Deleting the drawing Map repoints every Space Resource that selected it
      // and leaves the canvas on the survivor, which is its completion's move.
      onDelete: offered(mapAuthoring.map(map.id).delete, (remove) => () => {
        void commandOutcomes.run('map-delete', remove, { completionMovesMap: true });
      }),
      onCopyLink: runEntityCommand({ kind: 'map', map }, COPY_LINK_ACTION_ID),
    },
    graph: {
      graphs: projection.visibleGraphs,
      active: activeGraph,
      colorByGraphId: projection.colors,
      activeColor: projection.colors[activeGraph.id] ?? FALLBACK_GRAPH_COLOR,
      onActivate: location.activateGraph,
      onRename: availability.chromeTitleEdit
        ? (graphId, title) => renameChromeTitle({ kind: 'graph', id: graphId }, title)
        : null,
      // Answered rather than swallowed: a Graph Edit can be refused for reasons
      // no surface can see coming (`graph-not-owned`).
      onRecolor: (graphId, color) => {
        runGraphEdit(() => authoring.complete({ kind: 'recolored-graph', graphId, color }));
      },
      onCreate: () => {
        runGraphEdit(() => authoring.complete({ kind: 'added-graph' }));
      },
      // The notice is command outcomes'; the Graph Navigation adopts after a
      // completed delete is this caller's.
      onDelete: (graphId) => {
        void commandOutcomes
          .run('graph-delete', () =>
            coordinatedGraphDelete(spaceResources.deleteGraph, {
              targetSpaceId: space.id,
              mapId: map.id,
              graphId,
              preferredGraphId: null,
            }),
          )
          .then((result) => {
            if (result.kind === 'completed') {
              navigation.activateGraph(result.graphId);
            }
          });
      },
      editsDisabled: !availability.entityEdits,
      onCopyLink: runEntityCommand({ kind: 'graph', graph: activeGraph, map }, COPY_LINK_ACTION_ID),
      presenting,
      onPresent: navigation.present,
      // An empty Graph has nothing to traverse, which is a fact about the Graph
      // rather than about authoring availability; `availability.present` covers
      // a live content edit or chrome rename owning the keyboard.
      presentDisabled: !presenting && (!availability.present || activeGraph.edges.length === 0),
    },
    resources: {
      // The Dock draws this list and owns whether it is open, so what crosses
      // here is what the list shows and what a row does.
      list: {
        resources: resources.outside,
        allResources: space.resources,
        spaceTitleById: resources.spaceTitleById,
        spaces: referenceableSpaces,
        onAddSpace: (row) => placement.addSpaceResourceFor(row, centreAnchor()),
        memberships: resources.memberships,
        disabled: !availability.resourcesView,
        disclose: resources.disclose,
        revealedResourceId: resources.addressedResourceId,
        // No focus continuation: an anchored list keeps the reader in it, so
        // adding several Resources costs one disclosure, and Escape is the way
        // out to the canvas.
        onAdd: (resource) => placement.addExistingResource(resource.id, centreAnchor(), false),
        onDragStart: placement.startResourceDrag,
        onSpaceDragStart: placement.startSpaceDrag,
        onDragEnd: placement.endDrag,
      },
      // Both kinds complete their Edit on the press (ADR 0089). An exhaustive
      // record rather than one arm and a fall-through, so a kind added to the
      // cluster cannot inherit another kind's press in silence.
      onCreate: (kind) => {
        const create = {
          markdown: placement.addResource,
          space: placement.createSpaceResource,
        } satisfies Record<DockResourceKind, () => void>;
        create[kind]();
      },
      createDisabled: {
        markdown: !availability.addResource,
        space: !availability.createSpaceResource,
      },
    },
    persistence: {
      state: persistence,
      active,
      onRetry: authoring.retryPersistence,
      onAcceptRemote: authoring.acceptStoredSpace,
      onKeepLocal: authoring.keepLocalWork,
    },
  };
  return { chrome, onChromeContinuationLand };
}
