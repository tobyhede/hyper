import { useCallback } from 'react';
import {
  kindFlags,
  referenceKind,
  spaceKind,
  titleName,
  type KindId,
  type Map as SpaceMap,
  type Resource,
  type ResourceId,
} from '@project/core';
import type { Space } from '@project/graph';
import {
  DeleteIcon,
  EnterSpaceIcon,
  kindNaming,
  PresentIcon,
  FullViewIcon,
  OpenAndExpandIcon,
  RemoveFromMapIcon,
  ResourceKindIcon,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import type { ComposedApp } from './compose-app';
import { canvasElement } from './canvas-element';
import type { FocusFallback } from './delete-confirmation';
import { isOpenIndependently, type SpaceEntity } from './entity-actions';
import type { OpenSpaces } from './open-spaces';

/** The sentence the unavailable Create Reference row of a Resource that may not be a Target carries. */
export const referenceTerminal = (kind: KindId): string =>
  `${kindNaming(kind).listName} cannot be referenced.`;

export interface ResourceRailCommands {
  /** Create Reference, or `null` while no Resource may be added. */
  readonly createReference: (() => EntityActionOutcome) | null;
  /** Remove from Map, or `null` while it is unavailable. */
  readonly removeFromMap: (() => void) | null;
  /** Arm Delete from Space's confirmation, or `null` while it is unavailable. */
  readonly deleteFromSpace: (() => void) | null;
  /** Enter a Space Resource's Space, or `null` without an open set to enter it in. */
  readonly enter: RailNavigation | null;
  /** Present the Active Graph from this Resource, or `null` with nothing to present from. */
  readonly present: RailPresentation | null;
  /** Read this Resource in Full View, or `null` where no Full View is drawn. */
  readonly fullView: (() => void) | null;
  /** Open this Resource and expand it to fit its content, or `null` where it cannot be. */
  readonly openAndExpand: (() => void) | null;
}

/** The sentence Present from Here carries while the Active Graph does not hold its Resource. */
export const PRESENT_OFF_GRAPH = 'This Resource is not on the Active Graph.';

/**
 * The sentence Present from Here carries on the Active Graph while presenting is
 * withheld (`AuthoringAvailability.present`): a content edit or a rename holds
 * the keyboard, or an image replacement is running.
 */
export const PRESENT_WHILE_EDITING = 'Finish the edit in progress to present.';

/**
 * Present from Here, which is offered disabled with its reason while the
 * Active Graph does not hold the Resource or presenting is withheld, as Create
 * Reference is: the reader sees that the command exists and why it cannot run
 * here.
 */
export interface RailPresentation extends RailNavigation {
  readonly onActiveGraph: boolean;
}

/**
 * A rail command that navigates, carrying its own availability.
 *
 * Entering moves the canvas to another Space, so it is drawn from the
 * navigation answer (`AuthoringAvailability.navigate`) — the same answer the
 * Dock's navigation draws from — rather than offered and then refused by
 * `OpenSpaces.enter` (ADR 0112).
 */
export interface RailNavigation {
  readonly run: () => void;
  readonly available: boolean;
}

/**
 * What a Resource's own rail offers, in the order it draws it.
 *
 * The addresses are `spaceEntityActions`' answer and nothing else — the same
 * menu the Space's surface builds for the same entity, so a Resource's links
 * cannot come to mean different things on the two surfaces. What is added are
 * the commands that are the Resource's own: creating a Reference Resource from
 * it, removing it from the Map, and deleting it.
 *
 * Create Reference leads, then Connect to Resource, then the addresses, then
 * the two commands that leave the Resource behind sharing the trailing
 * destructive group. A Space
 * Resource's menu pairs Enter with Open in New Tab ahead of its copy links.
 */
export function resourceRailGroups(
  resource: Resource,
  addresses: readonly EntityActionGroup[],
  connect: EntityActionGroup,
  commands: ResourceRailCommands,
): readonly EntityActionGroup[] {
  const {
    createReference,
    removeFromMap,
    deleteFromSpace,
    enter,
    present,
    fullView,
    openAndExpand,
  } = commands;
  // A Resource no other may reference as its Target offers Create Reference
  // disabled, saying why, so referencing stays a single hop (ADR 0113).
  const terminal = kindFlags(resource.kind).mayBeTarget ? null : referenceTerminal(resource.kind);
  const reference: readonly EntityActionGroup[] =
    createReference === null
      ? []
      : [
          [
            {
              id: 'create-reference',
              // Named for the vocabulary the other creations use; the menu is
              // already named for its Resource.
              label: 'Create Reference',
              disabled: terminal !== null,
              description: terminal ?? undefined,
              icon: <ResourceKindIcon kind={referenceKind.id} decorative />,
              // **No `report`, and that is what closes the menu.** A reporting
              // item is held open to show its word (`EntityActionsMenu`), and
              // this command puts the caret in the new Reference Resource's
              // Title editor on the canvas — a menu left up would intercept
              // every pointer event over it. A refusal takes the standing
              // notice, which is where ADR 0089 puts the outcome of a creation
              // that completes on activation.
              onSelect: createReference,
            },
          ],
        ];
  // Seeing a Resource whole: expanding it on the Map, which is an Edit, then
  // reading it and presenting from it, which change nothing in the Space.
  const presenting: EntityActionGroup = [
    ...(openAndExpand === null
      ? []
      : [
          {
            id: 'open-and-expand',
            label: 'Open and Expand',
            icon: <OpenAndExpandIcon />,
            onSelect: (): EntityActionOutcome => {
              openAndExpand();
              return 'done';
            },
          },
        ]),
    ...(fullView === null
      ? []
      : [
          {
            id: 'full-view',
            label: 'Read in Full View',
            icon: <FullViewIcon />,
            onSelect: (): EntityActionOutcome => {
              fullView();
              return 'done';
            },
          },
        ]),
    ...(present === null
      ? []
      : [
          {
            id: 'present-from-here',
            label: 'Present from Here',
            icon: <PresentIcon color="currentColor" />,
            disabled: !present.available || !present.onActiveGraph,
            description: !present.onActiveGraph
              ? PRESENT_OFF_GRAPH
              : present.available
                ? undefined
                : PRESENT_WHILE_EDITING,
            onSelect: (): EntityActionOutcome => {
              present.run();
              return 'done';
            },
          },
        ]),
  ];
  const leaving: EntityActionGroup = [
    ...(removeFromMap === null
      ? []
      : [
          {
            id: 'remove-from-map',
            label: 'Remove from Map',
            icon: <RemoveFromMapIcon />,
            onSelect: (): EntityActionOutcome => {
              removeFromMap();
              return 'done';
            },
          },
        ]),
    ...(deleteFromSpace === null
      ? []
      : [
          {
            id: 'delete-resource',
            // The menu drawing this item is already named for its Resource.
            label: 'Delete from Space',
            icon: <DeleteIcon />,
            variant: 'destructive' as const,
            // **It asks, and the confirmation runs it.** Deleting a Resource is
            // not undoable in V1, and deleting a Space Resource can take the
            // Space it references and every Space below it that nothing else
            // references (ADR 0074). The dialog is drawn at the App root,
            // because the menu closes on the press and would take the question
            // with it — and the item carries no `report`, since a word swapped
            // in beside a dialog still asking would announce a deletion the
            // reader might yet cancel.
            onSelect: (): EntityActionOutcome => {
              deleteFromSpace();
              return 'done';
            },
          },
        ]),
  ];
  if (resource.kind === spaceKind.id) {
    // The Title edits in place on the drawn Resource; this menu authors neither
    // the Resource's name nor the target Space's.
    const links = addresses.flat();
    const entering: EntityActionGroup =
      enter === null
        ? []
        : [
            {
              id: 'enter',
              label: 'Enter',
              icon: <EnterSpaceIcon />,
              disabled: !enter.available,
              onSelect: () => {
                enter.run();
                return 'done';
              },
            },
          ];
    return [
      reference.flat(),
      connect,
      presenting,
      [...entering, ...links.filter((action) => isOpenIndependently(action.id))],
      links.filter((action) => !isOpenIndependently(action.id)),
      leaving,
    ];
  }
  return [
    ...reference,
    connect,
    ...(presenting.length > 0 ? [presenting] : []),
    ...addresses,
    ...(leaving.length > 0 ? [leaving] : []),
  ];
}

export interface ResourceRailInput {
  readonly space: Space;
  readonly map: SpaceMap;
  readonly entityActions: (entity: SpaceEntity) => readonly EntityActionGroup[];
  readonly availability: Pick<
    AuthoringAvailability,
    'addResource' | 'authorOnCanvas' | 'deleteResource' | 'navigate' | 'present'
  >;
  /** Whether Present from Here may start at a Resource (`presentsFrom`). */
  readonly canPresentFrom: (resourceId: ResourceId) => boolean;
  /** Present the Active Graph from a Resource, or `null` where nothing presents. */
  readonly presentFrom: ((resourceId: ResourceId) => void) | null;
  /** Read a Resource in Full View, or `null` where no Full View is drawn. */
  readonly showFullView: ((resourceId: ResourceId) => void) | null;
  readonly editingResourceBody: boolean;
  readonly createReferenceFrom: (resource: Resource) => EntityActionOutcome;
  readonly spaces: OpenSpaces | null;
}

/** The Actions trigger on a Resource's rail, while the rail is drawn. */
const actionsTriggerOf = (resourceId: ResourceId): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `[data-resource-rail-for="${CSS.escape(resourceId)}"] [data-slot="entity-actions-trigger"]`,
  );

/**
 * Where Delete from Space's question returns the caret when the menu row that
 * armed it has closed with its menu: the Resource's Actions trigger while the
 * Space still holds the Resource, and otherwise the canvas, where a completed
 * Edit with no subject left leaves it. Read when the question closes, from the
 * working Space rather than the drawn one, because the rail is still drawn for
 * a moment after the deletion completes.
 */
const railFocusFallback =
  (currentSpace: ComposedApp['currentSpace'], resourceId: ResourceId): FocusFallback =>
  () =>
    (currentSpace().lookup.resource(resourceId) === undefined
      ? null
      : actionsTriggerOf(resourceId)) ?? canvasElement();

/**
 * The builder a Resource's rail draws its menu from.
 *
 * Remove from Map follows the canvas key's availability, Delete from Space
 * follows Delete Resource's, and a Space Resource's Enter follows navigation's
 * (`space-resource-enter-hold.test.tsx`). Opening a Resource withdraws neither: each gives
 * back the room the Open Resource held — `resource-rail-actions.test.tsx`
 * (`offers Remove from Map and Delete from Space while the Resource is Open`).
 */
export function useResourceRailActions(
  { surface: { authoring }, commandOutcomes, currentSpace, resourceDeletion }: ComposedApp,
  {
    space,
    map: selectedMap,
    entityActions,
    availability,
    editingResourceBody,
    createReferenceFrom,
    spaces,
    canPresentFrom,
    presentFrom,
    showFullView,
  }: ResourceRailInput,
): (
  resourceId: ResourceId,
  connect: EntityActionGroup,
  openAndExpand?: (() => void) | null,
) => readonly EntityActionGroup[] {
  const { addResource, authorOnCanvas, deleteResource, navigate, present } = availability;
  return useCallback(
    (
      resourceId: ResourceId,
      connect: EntityActionGroup,
      openAndExpand: (() => void) | null = null,
    ): readonly EntityActionGroup[] => {
      const resource = space.lookup.resource(resourceId);
      // A node the projection is still drawing for a Resource the working Space
      // no longer has: no commands rather than commands that name nothing.
      if (resource === undefined) return [];
      return resourceRailGroups(
        resource,
        entityActions({ kind: 'resource', resource, map: selectedMap }),
        connect,
        {
          createReference: addResource ? () => createReferenceFrom(resource) : null,
          removeFromMap:
            authorOnCanvas && !editingResourceBody
              ? () => {
                  commandOutcomes.run('resource-remove', () =>
                    authoring.complete({ kind: 'removed-resource-from-map', resourceId }),
                  );
                }
              : null,
          deleteFromSpace: deleteResource
            ? () =>
                resourceDeletion.askToDelete(resource, railFocusFallback(currentSpace, resourceId))
            : null,
          enter:
            spaces === null || resource.kind !== spaceKind.id
              ? null
              : {
                  available: navigate,
                  run: () => {
                    void commandOutcomes.run(
                      'space-enter',
                      async () =>
                        spaces.enter(
                          resource.content.spaceId,
                          resource.content.map,
                          resource.content.graph,
                          resource.content.framing,
                          space.id,
                        ),
                      { subject: titleName(resource.title) },
                    );
                  },
                },
          present:
            presentFrom === null
              ? null
              : {
                  available: present,
                  onActiveGraph: canPresentFrom(resourceId),
                  run: () => presentFrom(resourceId),
                },
          fullView: showFullView === null ? null : () => showFullView(resourceId),
          openAndExpand,
        },
      );
    },
    [
      space,
      selectedMap,
      entityActions,
      addResource,
      authorOnCanvas,
      deleteResource,
      navigate,
      editingResourceBody,
      createReferenceFrom,
      spaces,
      present,
      canPresentFrom,
      presentFrom,
      showFullView,
      authoring,
      commandOutcomes,
      currentSpace,
      resourceDeletion,
    ],
  );
}
