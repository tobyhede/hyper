import {
  titleName,
  type Card,
  type Graph,
  type GraphId,
  type Layout,
  type LayoutId,
  type UUID,
} from '@project/core';
import type { ProductDestination } from '@project/http';
import {
  CopyIcon,
  DeleteIcon,
  EditIcon,
  type EntityAction,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';

/**
 * What each entity in a Space offers, built once.
 *
 * It exists as its own module rather than as a closure inside `App.tsx` for one
 * reason: a story that draws this menu has to draw *this* menu. The commands
 * were prototyped as a story-local list, and a story-local list is a second
 * menu that agrees with production only for as long as somebody keeps it in
 * step — a menu on screen in the catalogue that the application does not have
 * is worse evidence than none.
 *
 * **It has two consumers and they spend it differently.** A Card's own rail
 * draws the `card` arm as a menu (ADR 0073), and the Command Dock spends the
 * other three one command at a time — its Layout, Graph and Space clusters are
 * menus of their own with a radio group in them, so what they take from here is
 * the *decision* about which address an entity offers rather than a list to
 * render. Either way the decision is made once: the two surfaces cannot come to
 * disagree about what a Graph's "Copy link" means.
 *
 * Pure: it decides the whole menu from the entity and the four callbacks it was
 * composed with, and the callbacks are where every side effect lives.
 */

/**
 * The id of the one entity command whose *outcome* a caller reads rather than
 * assumes.
 *
 * Exported so a consumer spells it from here instead of from a second literal
 * that happens to agree. It outlived the Sidebar that first needed it — that
 * surface read the outcome to decide whether to dismiss its mobile Sheet — and
 * it stays because the answer is still the only way to tell a Delete that ran
 * from one the domain refused.
 */
export const DELETE_LAYOUT_ACTION_ID = 'delete-layout';

/**
 * The two addresses, spelled once.
 *
 * Same reason as the constant above, arrived at the other way round: the Dock's
 * clusters draw their own menus and cannot render an `EntityActionGroup[]`
 * whole, so they reach into this list by id — and they did it with bare
 * literals at four call sites. `runEntityCommand` looks an id up and spends
 * `?.onSelect()` on the miss, so a rename here left the copy commands silently
 * inert with `tsc` and lint both green. One spelling on both sides, and
 * {@link EntityCommandId} is what stops a fifth being invented.
 */
export const COPY_LINK_ACTION_ID = 'copy-link';
export const COPY_PERMANENT_LINK_ACTION_ID = 'copy-permanent-link';

/** The commands a surface may ask this list for by id. */
export type EntityCommandId =
  | typeof DELETE_LAYOUT_ACTION_ID
  | typeof COPY_LINK_ACTION_ID
  | typeof COPY_PERMANENT_LINK_ACTION_ID;

/**
 * An entity a surface offers commands for, named the way that surface knows it.
 *
 * It carries the whole `Layout`/`Graph`/`Card` rather than an id: handed an id,
 * a caller has to find the thing again down a second path, and the surface and
 * the menu it draws are then free to disagree about what they are naming.
 */
export type SpaceEntity =
  | { readonly kind: 'space' }
  | { readonly kind: 'layout'; readonly layout: Layout }
  | { readonly kind: 'graph'; readonly graph: Graph; readonly layout: Layout }
  | { readonly kind: 'card'; readonly card: Card; readonly layout: Layout };

/** What an inline rename names, for the two entities that have one. */
export type SpaceChromeTitleSubject =
  { readonly kind: 'layout'; readonly id: UUID } | { readonly kind: 'graph'; readonly id: GraphId };
export interface SpaceEntityActionsOptions {
  readonly spaceId: UUID;
  /** Named in the Space's own destination sentence. */
  readonly spaceTitle: string;
  /**
   * Puts one address on the clipboard, answering whether it got there.
   *
   * The answer is what the menu item reports, which is why this is not a plain
   * `void`: a browser that refuses clipboard access refuses it a microtask
   * after the press, so an item that reported on the press said "Copied" over a
   * link nobody could paste. A caller that cannot fail — a fixture recording
   * the destination — answers `true`.
   */
  readonly onCopy: (destination: ProductDestination) => boolean | Promise<boolean>;
  /**
   * Begins the entity's inline rename, or `null` while no rename may begin.
   *
   * `null` rather than a disabled item: Rename here is a second path to the
   * very chrome title edit that a live Card title editor withdraws, so while it
   * cannot run there is nothing to offer.
   */
  readonly onRename: ((subject: SpaceChromeTitleSubject, title: string) => void) | null;
  /**
   * Deletes the Layout, answering whether it went, or `null` while no Layout
   * Edit may run.
   *
   * The answer is not decoration: it is the only way a caller can tell a Delete
   * that ran from one the domain refused, and a callback that swallowed its
   * outcome left the item answering `done` either way. Same shape and same
   * reason as `onCopy` above.
   */
  readonly onDeleteLayout: ((layoutId: LayoutId) => boolean) | null;
}

/**
 * The two link forms, named the way a reader without the domain model reads
 * them (`.scratch/link-ux/issues/01`, Terminology).
 *
 * **"Copy link" is whichever address reproduces what is on screen** — the one
 * within the drawing Layout where that address exists, the entity's own where
 * it does not — and **"Copy permanent link" is offered only when it differs**.
 * Neither label says "canonical" or "contextual"; those words stay in the code
 * and out of the product.
 *
 * The `space` branch below is the one place this rule is not followed, and it
 * says why there.
 */
const COPY_LINK = 'Copy link';
const COPY_PERMANENT_LINK = 'Copy permanent link';

/**
 * What a copy command's own label says when the clipboard refused it.
 *
 * The application also pins "Link not copied" under the header, and that notice
 * is not enough on its own: below the Sidebar's breakpoint the menu is inside a
 * Sheet drawn over the area the notice renders in, so the item the reader just
 * pressed is the only place they can be told. Same two words as the notice's
 * title, minus the subject the item already names.
 */
const NOT_COPIED = 'Not copied';

const copy = (
  id: string,
  label: string,
  description: string,
  destination: ProductDestination,
  onCopy: SpaceEntityActionsOptions['onCopy'],
): EntityAction => ({
  id,
  label,
  description,
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
  spaceTitle,
  onCopy,
  onRename,
  onDeleteLayout,
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
      // No Rename: the application has no Space rename affordance, and a menu
      // is not the place to invent one.
      //
      // One address, and it is the Space's **own** — the one place this module
      // departs from the rule above, so it is written down rather than left to
      // be discovered. An address that reproduces what is on screen does exist:
      // the drawing Layout's. Copying that here would hand a recipient the
      // Collection the reader is looking at, and would give this menu the
      // second form ("Copy permanent link") it has never had. It would also
      // stop the Space's link meaning the Space. Which of the two a Space title
      // means is a product decision `.scratch/link-ux` has not taken, so the
      // behaviour stands and the item's own sentence says plainly where it
      // lands rather than implying the screen.
      return [
        [],
        [
          copy(
            COPY_LINK_ACTION_ID,
            COPY_LINK,
            `Opens ${spaceTitle} at the Layout it opens on`,
            { kind: 'space', spaceId },
            onCopy,
          ),
        ],
        [],
      ];
    }

    if (entity.kind === 'layout') {
      const { id: layoutId, title } = entity.layout;
      return [
        renameAction({ kind: 'layout', id: layoutId }, title),
        [
          copy(
            COPY_LINK_ACTION_ID,
            COPY_LINK,
            `Opens ${title} exactly as it draws now`,
            { kind: 'layout', spaceId, layoutId },
            onCopy,
          ),
        ],
        onDeleteLayout === null
          ? []
          : [
              {
                // Named from the constant above rather than written out, so a
                // caller that recognises this one command spells it the same
                // way this does.
                id: DELETE_LAYOUT_ACTION_ID,
                label: 'Delete Layout',
                icon: <DeleteIcon />,
                variant: 'destructive',
                // The Edit's prose report is the application's own refusal
                // alert, and this item carries no words of its own to swap — so
                // what the outcome is read for is not the label. It is what
                // tells a caller whether the Delete had a canvas result at all.
                onSelect: (): EntityActionOutcome => (onDeleteLayout(layoutId) ? 'done' : 'failed'),
              },
            ],
      ];
    }

    if (entity.kind === 'graph') {
      // A Layout **owns** its Graphs (ADR 0040), so a Graph row always has a
      // within-Layout address and both link forms are always offered here.
      const { graph, layout } = entity;
      return [
        renameAction({ kind: 'graph', id: graph.id }, graph.title),
        [
          copy(
            COPY_LINK_ACTION_ID,
            COPY_LINK,
            `Opens ${graph.title} inside ${layout.title}`,
            { kind: 'layout-graph', spaceId, layoutId: layout.id, graphId: graph.id },
            onCopy,
          ),
          copy(
            COPY_PERMANENT_LINK_ACTION_ID,
            COPY_PERMANENT_LINK,
            `Always opens ${graph.title}, in whichever Layout draws it`,
            { kind: 'graph', spaceId, graphId: graph.id },
            onCopy,
          ),
        ],
        [],
      ];
    }

    const { card, layout } = entity;
    // A menu row names the Card, so it says the Card's name (ADR 0083).
    const cardName = titleName(card.title);
    const permanent: ProductDestination = { kind: 'card', spaceId, cardId: card.id };
    // A Layout's members *are* its position keys (ADR 0040). A Card the Cards
    // drawer reveals but this Layout does not place has no within-Layout
    // address at all, so the one link it has is its own — and there is nothing
    // left for a permanent link to differ from. Withheld, never shown and
    // refused: `layout-card` would 404 on the address it copied.
    const placed = layout.positions[card.id] !== undefined;
    return [
      // No Rename: a Card's title is renamed in place on the canvas, and the
      // chrome title edit takes Layout and Graph subjects only.
      [],
      placed
        ? [
            copy(
              COPY_LINK_ACTION_ID,
              COPY_LINK,
              `Opens ${cardName} inside ${layout.title}, selected the way it is now`,
              { kind: 'layout-card', spaceId, layoutId: layout.id, cardId: card.id },
              onCopy,
            ),
            copy(
              COPY_PERMANENT_LINK_ACTION_ID,
              COPY_PERMANENT_LINK,
              `Always opens ${cardName} on its own, wherever it is placed`,
              permanent,
              onCopy,
            ),
          ]
        : [
            copy(
              COPY_LINK_ACTION_ID,
              COPY_LINK,
              `Opens ${cardName} on its own — ${layout.title} does not place it`,
              permanent,
              onCopy,
            ),
          ],
      [],
    ];
  };
}
