import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Map as SpaceMap,
  MapId,
  MapPosition,
  Resource,
  ResourceId,
  ResourcePlacement,
  UUID,
} from '@project/core';
import { Placement } from '@project/graph';
import type { ObserverErrorReporter } from '@project/persistence';
import type { EntityActionOutcome } from '@project/ui';
import {
  describeAuthoringRefusal,
  describeSpaceResourceBreak,
  describeSpaceResourceRefusal,
} from './authoring-refusal';
import { resolveMap } from './map-resolution';
import type { OpenSpace } from './open-spaces';
import { RESOURCE_HEIGHT, RESOURCE_WIDTH } from './resource';
import {
  completedResourceDrag,
  completedSpaceDrag,
  type ResourcesDrag,
  type ResourcesPopoverSpace,
  type SettlePlacement,
  type SettleResource,
} from './resources-drag';
import { nextSpaceTitle } from './titles';
import { useVisibleCentre, type VisibleCentreReporting } from './visible-centre';

/**
 * How far a new Reference Resource steps from the Resource it was created from, as a fraction of
 * its collapsed size on both axes, plus any room its Open Target holds.
 *
 * Overlap is authored rather than avoided — a free-position search is a placement
 * algorithm, and ADR 0086 keeps those behind an Edit — so this is deliberately
 * less than a whole step. It is more than half a step because at exactly half the
 * new Reference Resource's centre lands on the Target's bottom-right corner, and the Target
 * takes the pointer there: three quarters leaves a quarter-Resource corner of
 * overlap and a centre the author can reach.
 */
export const REFERENCE_OFFSET_RATIO = 0.75;

/**
 * Where a Reference Resource created from a Resource lands.
 *
 * **A fixed offset from the source**, so the Reference Resource lands where the
 * author is looking; a Resource this Map does not place has no offset to take,
 * so its Reference Resource lands at the visible centre like any other creation.
 *
 * **The offset leaves the Reference Resource clear of the Target after Close.**
 * An Open Target holds room that Close reclaims from every Resource clear of it
 * (ADR 0084). The growth is added to the collapsed offset and, when the Target
 * is Open, the anchor stays at or past the collapsed rect so Close reclaims the
 * width alone (ADR 0093). `resource-rail-actions.test.tsx` holds that the
 * Reference Resource stays separated after Close.
 */
export function referenceAnchor(
  at: ResourcePlacement | undefined,
  centreAnchor: () => MapPosition,
): MapPosition {
  if (at === undefined) return centreAnchor();
  const growth = at.open ? Placement.growth(at.openSize) : { width: 0, height: 0 };
  const across = growth.width + Math.round(RESOURCE_WIDTH * REFERENCE_OFFSET_RATIO);
  const down = growth.height + Math.round(RESOURCE_HEIGHT * REFERENCE_OFFSET_RATIO);
  return {
    x: at.x + (at.open ? Math.max(RESOURCE_WIDTH, across) : across),
    y: at.y + (at.open ? Math.max(RESOURCE_HEIGHT, down) : down),
  };
}

export interface ResourcePlacementInput {
  /** The Map the canvas draws. */
  readonly map: SpaceMap;
  readonly presenting: boolean;
  /** ADR 0042's epoch: a replacement discards a drag in flight. */
  readonly replacementEpoch: number;
  readonly reportBreak: ObserverErrorReporter;
}

export interface ResourcePlacementCommands extends VisibleCentreReporting {
  /** Add Resource: one completed Edit, then the naming continuation. */
  readonly addResource: () => void;
  /** Place a Resource this Map leaves out, answering a refusal's sentence or `null`. */
  readonly addExistingResource: (
    resourceId: ResourceId,
    anchor: MapPosition,
    focus: boolean,
  ) => string | null;
  /** Frame an existing Space with a Space Resource, answering a refusal's sentence or `null`. */
  readonly addSpaceResourceFor: (
    space: ResourcesPopoverSpace,
    anchor: MapPosition,
  ) => Promise<string | null>;
  /** Create Space Resource: one press, one Resource, one new Space (ADR 0089). */
  readonly createSpaceResource: () => void;
  /** Whether a Create Space Resource is between its press and its installed Edit. */
  readonly creatingSpaceResource: boolean;
  /** Create Reference, from the Resource it points at (ADR 0089). */
  readonly createReferenceFrom: (resource: Resource) => EntityActionOutcome;
  /** A drag from the Resources list began over a Resource row. */
  readonly startResourceDrag: (resourceId: ResourceId, settle: SettleResource) => void;
  /** A drag from the Resources list began over a Space row. */
  readonly startSpaceDrag: (space: ResourcesPopoverSpace, settle: SettlePlacement) => void;
  readonly endDrag: () => void;
  /** A Resource dropped on the canvas from the Resources list. */
  readonly dropExistingResource: (resourceId: ResourceId, anchor: MapPosition) => void;
  /** A Space dropped on the canvas from the Resources list. */
  readonly dropSpace: (spaceId: UUID, anchor: MapPosition) => void;
}

/**
 * Every way a Resource arrives on the drawn Map — created, added from the
 * Resources list, or dropped there — and the visible centre a Resource placed
 * by a press lands at.
 *
 * Each creation completes its Edit on activation (ADR 0089) and continues at
 * the Resource it made. A drag from the Resources list is held here from its
 * start to its drop, and is dropped with nothing placed when the Map, the mode
 * or the Space under it changes.
 */
export function useResourcePlacement(
  { app, session: spaceSession, spaceResources }: OpenSpace,
  { map, presenting, replacementEpoch, reportBreak }: ResourcePlacementInput,
): ResourcePlacementCommands {
  const { reportVisibleCentre, centreAnchor } = useVisibleCentre();
  const { authoring, adapter, continuation, commandOutcomes, navigation, currentSpace } = app;
  const mapId: MapId = map.id;

  /**
   * Framing a Space from the surface that offers it, so a reader who found it in
   * the list never meets a picker. The Title defaults to the Space's own;
   * renaming it afterwards is the ordinary inline Title edit (ADR 0083). The
   * anchor is the caller's: a press passes the visible centre and a drop the
   * point it landed on.
   */
  const addSpaceResourceFor = useCallback(
    async (space: ResourcesPopoverSpace, anchor: MapPosition): Promise<string | null> => {
      // Answers rather than rejects: the list spends this on a press or a drop
      // of one of its rows, so a rejection left to travel is a row that visibly
      // does nothing. `resolveMap` is inside the `try` because it is the
      // likeliest break on this path — the list has been open across renders
      // and the Map it resolves is the one drawing now.
      try {
        const resolved = resolveMap(currentSpace(), navigation.getState().selectedMapId);
        const result = await spaceResources.link({
          containingSpaceId: currentSpace().id,
          mapId: resolved.map.id,
          title: space.title,
          position: anchor,
          targetSpaceId: space.id,
        });
        return result.kind === 'refused' ? describeSpaceResourceRefusal(result.refusal) : null;
      } catch (failure) {
        // Both: the reader gets the sentence on the list that asked, and the
        // diagnostic still reaches the operational channel.
        reportBreak(failure);
        return describeSpaceResourceBreak(failure);
      }
    },
    [currentSpace, navigation, spaceResources, reportBreak],
  );

  const [creatingSpaceResource, setCreatingSpaceResource] = useState(false);

  /**
   * **Optimistic, in the one sense the lifecycle leaves open.** The coordination
   * installs its local Edit and *then* commits two snapshots, and the promise
   * here resolves at the installation — so the Resource is drawn and its Title
   * editor takes the caret while the durable commit is still in flight. A
   * refusal is delivered on that same resolution, before any Resource is
   * installed, so there is no half-made Resource to take away; the "Space not
   * created" notice is the half the author can see.
   *
   * `Space N` is minted from this Space's own Resource titles and handed to both
   * the Space and the Resource that names it, so the two agree at creation
   * (`titles.ts`). Referencing an *existing* Space is the Resources list's
   * add-Space row, not this command.
   */
  const createSpaceResource = useCallback((): void => {
    setCreatingSpaceResource(true);
    // An `async` thunk so a throw from the title minting or `resolveMap`
    // arrives at `run` as a rejection, as the lifecycle's own does.
    void commandOutcomes
      .run(
        'space-resource-create',
        async () => {
          const title = nextSpaceTitle(spaceSession.getState().working);
          // Resolved at the press rather than closed over, for a gesture whose
          // Edit lands one await later. `create` still refuses `map-not-found`
          // on its own account, against the Map the coordinated Edit sees.
          const resolved = resolveMap(currentSpace(), navigation.getState().selectedMapId);
          return spaceResources.create({
            containingSpaceId: currentSpace().id,
            mapId: resolved.map.id,
            title,
            position: centreAnchor(),
          });
        },
        {
          // The id the lifecycle minted, not the Resource that appeared: a
          // Markdown creation can land between this press and the installed
          // Edit, so "which Resource is new" answers a different question from
          // "which Resource did this press make". A refusal or an `unchanged`
          // made no Resource, so command outcomes requests nothing for either.
          //
          // Nothing bumps the Spaces epoch here: a created Space joins the Meta
          // Space for *every* open Space, so the lifecycle that made it is what
          // announces it (`space-resource-lifecycle.ts`).
          continueAt: ({ resourceId }) => ({
            target: { kind: 'resource', resourceId },
            select: true,
            then: 'rename',
          }),
        },
      )
      .finally(() => setCreatingSpaceResource(false));
  }, [commandOutcomes, spaceSession, currentSpace, navigation, spaceResources, centreAnchor]);

  /**
   * **The gesture supplies the Target, so nothing is chosen first**, and the
   * Title is the Target's, copied once and independent thereafter — ADR 0083
   * keeps the Target's name off the Resource front, so this is the author's
   * on-canvas indication of what the Reference Resource points at.
   */
  const createReferenceFrom = useCallback(
    (resource: Resource): EntityActionOutcome => {
      const anchor = referenceAnchor(map.positions[resource.id], centreAnchor);
      // A refusal takes the standing notice rather than the menu it was pressed
      // in: this command closes its menu, because it moves the caret onto the
      // canvas, so by the time an answer exists there is no row left to swap a
      // word on. The rows that *can* refuse are drawn unavailable, so what
      // reaches here is a Target that went between the draw and the press.
      const created = commandOutcomes.run(
        'reference-create',
        () =>
          authoring.complete({
            kind: 'created-reference',
            target: resource.id,
            title: resource.title,
            anchor,
          }),
        {
          continueAt: ({ createdResourceId }) =>
            createdResourceId === undefined
              ? null
              : {
                  target: { kind: 'resource', resourceId: createdResourceId },
                  select: true,
                  then: 'rename',
                },
        },
      );
      switch (created.kind) {
        case 'refused':
        case 'broke':
          return 'failed';
        // A discarded creation has nothing to say.
        case 'completed':
        case 'unchanged':
        case 'queued':
        case 'discarded':
          return 'done';
      }
    },
    [map, centreAnchor, commandOutcomes, authoring],
  );

  /**
   * The refusal goes back to the caller, and only the caller can place it.
   *
   * Both `added-resource-to-map` refusals this can produce
   * (`resource-already-in-map`, `resource-not-found`) mean the Resource just
   * left the list the reader activated it in. The Resources list is still on
   * screen though, and it is the surface that asked — so it keeps the sentence.
   */
  const addExistingResource = useCallback(
    (resourceId: ResourceId, anchor: MapPosition, focus: boolean): string | null => {
      const result = authoring.complete({ kind: 'added-resource-to-map', resourceId, anchor });
      if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
      if (result.kind !== 'completed') return null;
      adapter.getState().selectResource(resourceId);
      // The Resource is not drawn yet — the projection carrying this Edit
      // arrives a strategy later — so the continuation waits for it.
      if (focus) {
        continuation.request({
          target: { kind: 'resource', resourceId },
          select: false,
          then: 'focus',
        });
      }
      return null;
    },
    [authoring, adapter, continuation],
  );

  /**
   * **The one creation whose refusal no surface shows, and that is a decision.**
   * A refusal carries a sentence for the author (ADR 0042), worth showing where
   * the author can act on it. Add Resource takes no input at all, cannot refuse
   * against a choice the author made, and leaves nothing standing that a
   * sentence could correct. If it ever grows an input it grows a surface with
   * it, and the refusal goes there.
   *
   * The toolbar stays available for an empty authored Map: it is the
   * zero-Resource Space's way to create the first Resource.
   */
  const addResource = useCallback(() => {
    const created = authoring.complete({ kind: 'created-resource', anchor: centreAnchor() });
    // Each outcome named rather than caught. `queued` is an Edit that will still
    // be performed, whose projection draws the Resource without help from here.
    // `unchanged` this operation cannot answer — it mints unconditionally — but
    // the shared completion union carries it, so it is narrowed rather than
    // asserted away.
    if (created.kind === 'refused') return;
    if (created.kind === 'queued') return;
    if (created.kind === 'unchanged') return;
    if (created.createdResourceId === undefined) return;
    // Selected as well as named, so continued authoring — a connection, a second
    // Resource — carries on from it. Both are the one continuation, spent when
    // the projection that draws the Resource arrives.
    continuation.request({
      target: { kind: 'resource', resourceId: created.createdResourceId },
      select: true,
      then: 'rename',
    });
  }, [authoring, centreAnchor, continuation]);

  const resourcesDrag = useRef<ResourcesDrag | null>(null);
  useEffect(() => {
    resourcesDrag.current = null;
  }, [mapId, presenting, replacementEpoch]);

  const startResourceDrag = useCallback(
    (resourceId: ResourceId, settle: SettleResource) => {
      resourcesDrag.current = { kind: 'resource', resourceId, mapId, settle };
    },
    [mapId],
  );
  const startSpaceDrag = useCallback(
    (space: ResourcesPopoverSpace, settle: SettlePlacement) => {
      resourcesDrag.current = { kind: 'space', space, mapId, settle };
    },
    [mapId],
  );
  const endDrag = useCallback(() => {
    resourcesDrag.current = null;
  }, []);

  const dropExistingResource = useCallback(
    (resourceId: ResourceId, anchor: MapPosition): void => {
      const drag = completedResourceDrag(resourcesDrag.current, resourceId, mapId);
      resourcesDrag.current = null;
      if (drag === null) return;
      drag.settle(addExistingResource(resourceId, anchor, false));
    },
    [addExistingResource, mapId],
  );

  /**
   * The same placement a press spends, at the drop point, with its answer
   * settled on the list that started the drag. `addSpaceResourceFor` answers
   * rather than rejects, so the settlement is all that is left to do here.
   */
  const dropSpace = useCallback(
    (spaceId: UUID, anchor: MapPosition): void => {
      const drag = completedSpaceDrag(resourcesDrag.current, spaceId, mapId);
      resourcesDrag.current = null;
      if (drag === null) return;
      drag.settle(addSpaceResourceFor(drag.space, anchor));
    },
    [addSpaceResourceFor, mapId],
  );

  return {
    reportVisibleCentre,
    centreAnchor,
    addResource,
    addExistingResource,
    addSpaceResourceFor,
    createSpaceResource,
    creatingSpaceResource,
    createReferenceFrom,
    startResourceDrag,
    startSpaceDrag,
    endDrag,
    dropExistingResource,
    dropSpace,
  };
}
