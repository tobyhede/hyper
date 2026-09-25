import { type Resource, type Graph, type GraphId, type Map, type UUID } from '@project/core';
import type { ProductDestination } from '@project/http';
import {
  CopyIcon,
  EditIcon,
  OpenIndependentlyIcon,
  type EntityAction,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';

/**
 * What each entity in a Space offers, built once.
 *
 * It exists as its own module rather than as a closure inside `App.tsx` for one
 * reason: a story that draws this menu has to draw *this* menu. A story-local
 * list is a second menu that agrees with production only for as long as somebody keeps it in
 * step — a menu on screen in the catalogue that the application does not have
 * is worse evidence than none.
 *
 * **It has two consumers and they spend it differently.** A Resource's own rail
 * draws the `resource` arm as a menu (ADR 0073), and the Command Dock spends the
 * other three one command at a time — its Map, Graph and Space clusters are
 * menus of their own with a radio group in them, so what they take from here is
 * the *decision* about which address an entity offers rather than a list to
 * render. Either way the decision is made once: the two surfaces cannot come to
 * disagree about what a Graph's "Copy link" means.
 *
 * Pure: it decides the whole menu from the entity and the callbacks it was
 * composed with, and the callbacks are where every side effect lives.
 */

/**
 * The two addresses, spelled once.
 *
 * Exported so a consumer spells each from here instead of from a second
 * literal that happens to agree: the Dock's clusters draw their own menus and
 * cannot render an `EntityActionGroup[]`
 * whole, so they reach into this list by id. Do not spell one as a bare
 * literal: `runEntityCommand` looks an id up and spends `?.onSelect()` on the
 * miss, so a renamed id leaves the copy commands silently inert with `tsc` and
 * lint both green. One spelling on both sides, and {@link EntityCommandId} is
 * what stops another being invented.
 */
export const COPY_LINK_ACTION_ID = 'copy-link';
export const COPY_RESOURCE_LINK_ACTION_ID = 'copy-resource-link';
export const COPY_SPACE_LINK_ACTION_ID = 'copy-space-link';
export const COPY_LINK_TO_TARGET_ACTION_ID = 'copy-link-to-target';
export const OPEN_INDEPENDENTLY_ACTION_ID = 'open-independently';

/** The commands a surface may ask this list for by id. */
export type EntityCommandId = typeof COPY_LINK_ACTION_ID | typeof COPY_RESOURCE_LINK_ACTION_ID;

/**
 * An entity a surface offers commands for, named the way that surface knows it.
 *
 * It carries the whole `Map`/`Graph`/`Resource` rather than an id: handed an id,
 * a caller has to find the resource again down a second path, and the surface and
 * the menu it draws are then free to disagree about what they are naming.
 */
export type SpaceEntity =
  | { readonly kind: 'space' }
  | { readonly kind: 'map'; readonly map: Map }
  | { readonly kind: 'graph'; readonly graph: Graph; readonly map: Map }
  | { readonly kind: 'resource'; readonly resource: Resource; readonly map: Map };

/**
 * What an inline rename names — the three entities the Command Dock names, all
 * of which have one.
 *
 * **The Space arm carries no id, and that asymmetry is the domain's.** A
 * Map and a Graph are named *inside* a Space, so an Edit on one has to say
 * which, and the surface may be naming a Map the canvas has since left. A
 * Space rename writes `document.title` of the session the Edit is completed on,
 * which is the Space the Dock is drawing — there is no second candidate for it
 * to disambiguate, and `renamed-space` accordingly carries only the title
 * (`space-authoring.ts`). An id here would be a value nothing reads, asserted by
 * a surface that cannot be wrong about it.
 */
export type SpaceChromeTitleSubject =
  | { readonly kind: 'space' }
  | { readonly kind: 'map'; readonly id: UUID }
  | { readonly kind: 'graph'; readonly id: GraphId };
export interface SpaceEntityActionsOptions {
  readonly spaceId: UUID;
  /** Named in the Space's own destination sentence. */
  readonly spaceTitle: string;
  /**
   * Puts one address on the clipboard, answering whether it got there.
   *
   * The answer is what the menu item reports, which is why this is not a plain
   * `void`: a browser that refuses clipboard access refuses it a microtask
   * after the press, so an item that reported on the press would say "Copied"
   * over a link nobody could paste. A caller that cannot fail — a fixture recording
   * the destination — answers `true`.
   */
  readonly onCopy: (destination: ProductDestination) => boolean | Promise<boolean>;
  /**
   * Opens one address in a new browsing context, answering whether it opened.
   *
   * A Space Resource offers this for the Space it shows, on that Space's own
   * address and nothing the containing Map carries (ADR 0068). `null`
   * withholds the row — a story that only records copies has no tab to open.
   */
  readonly onOpenIndependently: ((destination: ProductDestination) => boolean) | null;
  /**
   * Begins the entity's inline rename, or `null` while no rename may begin.
   *
   * `null` rather than a disabled item: Rename here is a second path to the
   * very chrome title edit that a live Resource title editor withdraws, so while it
   * cannot run there is nothing to offer.
   */
  readonly onRename: ((subject: SpaceChromeTitleSubject, title: string) => void) | null;
}

/**
 * The link forms, named the way a reader without the domain model reads them
 * (`.scratch/link-ux/issues/01`, Terminology).
 *
 * **"Copy link" is whichever address reproduces what is on screen** — the one
 * within the drawing Map where that address exists, the entity's own where
 * it does not — and a second, more durable form is offered only where it
 * differs and only under its own name (a Resource's "Copy link to Resource").
 * Neither label says "canonical", "contextual" or "permanent"; those words
 * stay in the code and out of the product. A Graph's own durable address is
 * offered from no menu at all.
 *
 * The `space` branch below is the one place this rule is not followed, and it
 * says why there.
 */
const COPY_LINK = 'Copy link';
const RESOURCE_COPY_LINK_IN_MAP = 'Copy link to Resource in Map';
const RESOURCE_COPY_LINK = 'Copy link to Resource';
const COPY_SPACE_LINK = 'Copy link to Space';
const COPY_LINK_TO_TARGET = 'Copy link to Target';
const OPEN_INDEPENDENTLY = 'Open in New Tab';

/**
 * What an independent open reports when the browser refuses or cannot run `open`.
 *
 * **Not "Not opened".** `noopener` makes a successful `window.open` return `null`,
 * the same as a blocked popup, so the return value is not a success signal — only
 * whether `open` ran. "Sent" names that honestly; "Opened" would overclaim.
 */
const NOT_SENT = 'Not sent';

/**
 * What a copy command's own label says when the clipboard refused it.
 *
 * The application also pins "Link not copied" under the header, and that notice
 * is not enough on its own: the Resource rail is a menu on the canvas, and a
 * reader whose eyes are on the Resource they pressed is not looking at the
 * notice, so the item they just pressed is the only place they can be told. Same
 * two words as the notice's title, minus the subject the item already names.
 */
const NOT_COPIED = 'Not copied';

const copy = (
  id: string,
  label: string,
  destination: ProductDestination,
  onCopy: SpaceEntityActionsOptions['onCopy'],
): EntityAction => ({
  id,
  label,
  report: { done: 'Copied', failed: NOT_COPIED },
  icon: <CopyIcon />,
  // The item reports on the copy, so the copy is what is waited for. `async`
  // rather than a `then` chain because the answer is the return value here —
  // fire-and-forget past a `then` is exactly what let the label swap before the
  // clipboard had answered.
  onSelect: async (): Promise<EntityActionOutcome> =>
    (await onCopy(destination)) ? 'done' : 'failed',
});

export function spaceEntityActions({
  spaceId,
  onCopy,
  onOpenIndependently,
  onRename,
}: SpaceEntityActionsOptions): (entity: SpaceEntity) => readonly EntityActionGroup[] {
  const renameAction = (subject: SpaceChromeTitleSubject, title: string): EntityActionGroup =>
    onRename === null
      ? []
      : [
          {
            id: 'rename',
            label: 'Rename',
            icon: <EditIcon />,
            // `done` unconditionally: opening an editor is the whole command,
            // and whether the rename it begins is then accepted is the
            // editor's report to make, not this item's.
            onSelect: () => {
              onRename(subject, title);
              return 'done';
            },
          },
        ];

  return (entity) => {
    if (entity.kind === 'space') {
      // No Rename. The Dock renames a Space the way it renames a Map and a
      // Graph: by a click on the name it already draws, right beside this menu.
      // A row here would open that same editor from a second place — the same reason
      // the Map and Graph branches below get their Rename row only from a
      // caller that has one, while the application passes `onRename: null`.
      //
      // One address, and it is the Space's **own** — the one place this module
      // departs from the rule above, so it is written down rather than left to
      // be discovered. An address that reproduces what is on screen does exist:
      // the drawing Map's. Copying that here would hand a recipient the
      // Collection the reader is looking at, and would give this menu a second
      // address it has never had. It would also stop the Space's link meaning
      // the Space. Which of the two a Space title means is a product decision
      // `.scratch/link-ux` has not taken, so the behaviour stands and the
      // item's own sentence says plainly where it lands rather than implying
      // the screen.
      return [[], [copy(COPY_LINK_ACTION_ID, COPY_LINK, { kind: 'space', spaceId }, onCopy)], []];
    }

    if (entity.kind === 'map') {
      const { id: mapId, title } = entity.map;
      return [
        renameAction({ kind: 'map', id: mapId }, title),
        [copy(COPY_LINK_ACTION_ID, COPY_LINK, { kind: 'map', spaceId, mapId }, onCopy)],
        [],
      ];
    }

    if (entity.kind === 'graph') {
      // A Map **owns** its Graphs (ADR 0040), so a Graph row always has a
      // within-Map address, which is the only address this menu offers.
      const { graph, map } = entity;
      return [
        renameAction({ kind: 'graph', id: graph.id }, graph.title),
        [
          copy(
            COPY_LINK_ACTION_ID,
            COPY_LINK,
            { kind: 'map-graph', spaceId, mapId: map.id, graphId: graph.id },
            onCopy,
          ),
        ],
        [],
      ];
    }

    const { resource, map } = entity;
    // A menu row names the Resource, so it says the Resource's name (ADR 0083).
    const permanent: ProductDestination = { kind: 'resource', spaceId, resourceId: resource.id };
    // A Map's members *are* its position keys (ADR 0040). A Resource the Resources
    // list reveals but this Map does not place has no within-Map
    // address at all, so the one link it has is its own — and there is nothing
    // left for a permanent link to differ from. Withheld, never shown and
    // refused: `map-resource` would 404 on the address it copied.
    const placed = map.positions[resource.id] !== undefined;
    const resourceAddresses: readonly EntityAction[] = placed
      ? [
          copy(
            COPY_LINK_ACTION_ID,
            RESOURCE_COPY_LINK_IN_MAP,
            { kind: 'map-resource', spaceId, mapId: map.id, resourceId: resource.id },
            onCopy,
          ),
          copy(COPY_RESOURCE_LINK_ACTION_ID, RESOURCE_COPY_LINK, permanent, onCopy),
        ]
      : [copy(COPY_LINK_ACTION_ID, RESOURCE_COPY_LINK, permanent, onCopy)];
    /**
     * The Space this Resource shows, at that Space's own address.
     *
     * Copy link to Resource in Map and Copy link to Resource still name the
     * Resource. Independently opening the target is a third destination: no
     * containing Map, no presentation, and not this Space (ADR 0068, ADR
     * 0069). Offered only on a Space Resource — a Markdown Resource has no target
     * Space to address.
     */
    const targetSpaceAddress: readonly EntityAction[] =
      resource.kind !== 'space'
        ? []
        : [
            copy(
              COPY_SPACE_LINK_ACTION_ID,
              COPY_SPACE_LINK,
              { kind: 'space', spaceId: resource.spaceId },
              onCopy,
            ),
            ...(onOpenIndependently === null
              ? []
              : [
                  {
                    id: OPEN_INDEPENDENTLY_ACTION_ID,
                    label: OPEN_INDEPENDENTLY,
                    report: { done: 'Sent', failed: NOT_SENT },
                    icon: <OpenIndependentlyIcon />,
                    // Sync on purpose: `window.open` spends the click's user
                    // gesture, and an `await` here would yield and lose it.
                    onSelect: (): EntityActionOutcome =>
                      onOpenIndependently({ kind: 'space', spaceId: resource.spaceId })
                        ? 'done'
                        : 'failed',
                  },
                ]),
          ];
    /**
     * The Target a Reference Resource shows, at that Target's own Resource address.
     *
     * **One row, never two.** The Target is frequently absent from this
     * Map entirely, so there is no within-Map form for it to differ
     * from — unlike `resourceAddresses` above, which names the Reference Resource
     * itself and does have one when placed here. Offered only on a Reference
     * Resource (ADR 0092); a Markdown or Space Resource has no Target to address.
     */
    const targetResourceAddress: readonly EntityAction[] =
      resource.kind !== 'reference'
        ? []
        : [
            copy(
              COPY_LINK_TO_TARGET_ACTION_ID,
              COPY_LINK_TO_TARGET,
              { kind: 'resource', spaceId, resourceId: resource.target },
              onCopy,
            ),
          ];
    return [
      // No Rename: a Resource's title is renamed in place on the canvas, and the
      // chrome title edit takes Map and Graph subjects only.
      [],
      [...resourceAddresses, ...targetSpaceAddress, ...targetResourceAddress],
      [],
    ];
  };
}
