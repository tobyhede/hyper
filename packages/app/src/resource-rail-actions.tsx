import { useCallback } from 'react';
import { titleName, type Map as SpaceMap, type Resource, type ResourceId } from '@project/core';
import type { Space } from '@project/graph';
import {
  DeleteIcon,
  EnterSpaceIcon,
  RemoveFromMapIcon,
  ResourceKindIcon,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import type { ComposedApp } from './compose-app';
import { OPEN_INDEPENDENTLY_ACTION_ID, type SpaceEntity } from './entity-actions';
import type { OpenSpaces } from './open-spaces';

/** The sentence a Reference Resource's unavailable Create Reference row carries. */
export const REFERENCE_TERMINAL = 'A Reference Resource cannot be referenced.';

export interface ResourceRailCommands {
  /** Create Reference, or `null` while no Resource may be added. */
  readonly createReference: (() => EntityActionOutcome) | null;
  /** Remove from Map, or `null` while it is unavailable. */
  readonly removeFromMap: (() => void) | null;
  /** Arm Delete from Space's confirmation, or `null` while it is unavailable. */
  readonly deleteFromSpace: (() => void) | null;
  /** Enter a Space Resource's Space, or `null` without an open set to enter it in. */
  readonly enter: (() => void) | null;
}

/**
 * What a Resource's own rail offers (ADR 0073), in the order it draws it.
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
  const { createReference, removeFromMap, deleteFromSpace, enter } = commands;
  const terminal = resource.kind === 'reference' ? REFERENCE_TERMINAL : null;
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
              icon: <ResourceKindIcon kind="reference" decorative />,
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
  if (resource.kind === 'space') {
    // The Title edits in place on the Resource front; this menu authors neither
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
              onSelect: () => {
                enter();
                return 'done';
              },
            },
          ];
    return [
      reference.flat(),
      connect,
      [...entering, ...links.filter((action) => action.id === OPEN_INDEPENDENTLY_ACTION_ID)],
      links.filter((action) => action.id !== OPEN_INDEPENDENTLY_ACTION_ID),
      leaving,
    ];
  }
  return [...reference, connect, ...addresses, ...(leaving.length > 0 ? [leaving] : [])];
}

export interface ResourceRailInput {
  readonly space: Space;
  readonly map: SpaceMap;
  readonly entityActions: (entity: SpaceEntity) => readonly EntityActionGroup[];
  readonly availability: Pick<
    AuthoringAvailability,
    'addResource' | 'authorOnCanvas' | 'deleteResource'
  >;
  readonly editingResourceBody: boolean;
  readonly createReferenceFrom: (resource: Resource) => EntityActionOutcome;
  readonly spaces: OpenSpaces | null;
}

/**
 * The builder a Resource's rail draws its menu from.
 *
 * Remove from Map follows the canvas key's availability rather than Delete
 * Resource's: Delete is withdrawn while a Resource is Open so Open state cannot
 * outlive the Resource, while Remove reclaims that room and stays offered —
 * `resource-rail-actions.test.tsx` (`still offers Remove from Map while the
 * Resource is Open`).
 */
export function useResourceRailActions(
  { authoring, commandOutcomes, resourceDeletion }: ComposedApp,
  {
    space,
    map,
    entityActions,
    availability,
    editingResourceBody,
    createReferenceFrom,
    spaces,
  }: ResourceRailInput,
): (resourceId: ResourceId, connect: EntityActionGroup) => readonly EntityActionGroup[] {
  const { addResource, authorOnCanvas, deleteResource } = availability;
  return useCallback(
    (resourceId: ResourceId, connect: EntityActionGroup): readonly EntityActionGroup[] => {
      const resource = space.lookup.resource(resourceId);
      // A node the projection is still drawing for a Resource the working Space
      // no longer has: no commands rather than commands that name nothing.
      if (resource === undefined) return [];
      return resourceRailGroups(
        resource,
        entityActions({ kind: 'resource', resource, map }),
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
          deleteFromSpace: deleteResource ? () => resourceDeletion.arm(resource) : null,
          enter:
            spaces === null || resource.kind !== 'space'
              ? null
              : () => {
                  void commandOutcomes.run(
                    'space-enter',
                    async () =>
                      spaces.enter(
                        resource.spaceId,
                        resource.map,
                        resource.graph,
                        resource.framing,
                      ),
                    { subject: titleName(resource.title) },
                  );
                },
        },
      );
    },
    [
      space,
      map,
      entityActions,
      addResource,
      authorOnCanvas,
      deleteResource,
      editingResourceBody,
      createReferenceFrom,
      spaces,
      authoring,
      commandOutcomes,
      resourceDeletion,
    ],
  );
}
