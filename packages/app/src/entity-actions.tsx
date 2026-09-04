import type { LayoutId, UUID } from '@project/core';
import type { ProductDestination } from '@project/http';
import {
  CopyIcon,
  DeleteIcon,
  EditIcon,
  type EntityAction,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';
import type { SpaceChromeTitleSubject, SpaceEntity } from './components/SpaceSidebar';

/**
 * What every entity in the Space Sidebar offers, built once.
 *
 * It exists as its own module rather than as a closure inside `App.tsx` for one
 * reason: a story that draws this menu has to draw *this* menu. The commands
 * were prototyped as a story-local list, and a story-local list is a second
 * menu that agrees with production only for as long as somebody keeps it in
 * step — a menu on screen in the catalogue that the application does not have
 * is worse evidence than none. `SpaceSidebarFixture` calls this, so the stable
 * Space story and the application cannot offer different commands.
 *
 * Pure: it decides the whole menu from the entity and the four callbacks it was
 * composed with, and the callbacks are where every side effect lives.
 */
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
   * cannot run there is nothing to offer. It takes the focus the row should get
   * back, because who owns the caret afterwards is the Sidebar's business and
   * not this module's.
   */
  readonly onRename:
    ((subject: SpaceChromeTitleSubject, title: string, returnFocus: () => void) => void) | null;
  /** Deletes the Layout, or `null` while no Layout Edit may run. */
  readonly onDeleteLayout: ((layoutId: LayoutId) => void) | null;
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
  confirmation: 'Copied',
  failure: NOT_COPIED,
  icon: <CopyIcon />,
  // The item reports on the copy, so the copy is what is waited for. `async`
  // rather than a `then` chain because the answer is the return value here —
  // fire-and-forget past a `then` is exactly what let the label swap before the
  // clipboard had answered.
  onSelect: async (): Promise<EntityActionOutcome> =>
    (await onCopy(destination)) ? 'done' : 'failed',
});

/**
 * Focus the Sidebar row a rename was begun from.
 *
 * By the row's own addressing attribute rather than by a captured element: the
 * menu item that begins the rename is inside a popup that is gone by the time
 * the editor commits, so there is no element left to have held on to.
 *
 * The **row**, and not the addressed element: a row draws its title as a button
 * and its live rename as a `div`, both carrying the attribute, and this runs
 * from inside the editor's key handler — before React has swapped the editing
 * branch back — so the element the attribute finds is the unfocusable one.
 * The `<li>` around it is what survives the swap, which is why the click path
 * into the same rename focuses it too.
 */
const focusRow = (attribute: string, id: string) => () => {
  document.querySelector<HTMLElement>(`[${attribute}="${id}"]`)?.closest('li')?.focus();
};

export function spaceEntityActions({
  spaceId,
  spaceTitle,
  onCopy,
  onRename,
  onDeleteLayout,
}: SpaceEntityActionsOptions): (entity: SpaceEntity) => readonly EntityActionGroup[] {
  const renameAction = (
    subject: SpaceChromeTitleSubject,
    title: string,
    attribute: string,
  ): EntityActionGroup =>
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
              onRename(subject, title, focusRow(attribute, subject.id));
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
            'copy-link',
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
        renameAction({ kind: 'layout', id: layoutId }, title, 'data-layout'),
        [
          copy(
            'copy-link',
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
                id: 'delete-layout',
                label: 'Delete Layout',
                icon: <DeleteIcon />,
                variant: 'destructive',
                // The Edit reports through the Sidebar's own refusal alert, and
                // this item carries no confirmation to swap, so `done` is all
                // there is to say here.
                onSelect: () => {
                  onDeleteLayout(layoutId);
                  return 'done';
                },
              },
            ],
      ];
    }

    if (entity.kind === 'graph') {
      // A Layout **owns** its Graphs (ADR 0040), so a Graph row always has a
      // within-Layout address and both link forms are always offered here.
      const { graph, layout } = entity;
      return [
        renameAction({ kind: 'graph', id: graph.id }, graph.title, 'data-graph-id'),
        [
          copy(
            'copy-link',
            COPY_LINK,
            `Opens ${graph.title} inside ${layout.title}`,
            { kind: 'layout-graph', spaceId, layoutId: layout.id, graphId: graph.id },
            onCopy,
          ),
          copy(
            'copy-permanent-link',
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
    const permanent: ProductDestination = { kind: 'card', spaceId, cardId: card.id };
    // A Layout's members *are* its position keys (ADR 0040). A Card the Cards
    // drawer reveals but this Layout does not place has no within-Layout
    // address at all, so the one link it has is its own — and there is nothing
    // left for a permanent link to differ from. Withheld, never shown and
    // refused: `layout-card` would 404 on the address it copied.
    const placed = layout.positions[card.id] !== undefined;
    return [
      // No Rename: a Card's title is renamed in place on the canvas, and the
      // Sidebar's chrome title edit takes Layout and Graph subjects only.
      [],
      placed
        ? [
            copy(
              'copy-link',
              COPY_LINK,
              `Opens ${card.title} inside ${layout.title}, selected the way it is now`,
              { kind: 'layout-card', spaceId, layoutId: layout.id, cardId: card.id },
              onCopy,
            ),
            copy(
              'copy-permanent-link',
              COPY_PERMANENT_LINK,
              `Always opens ${card.title} on its own, wherever it is placed`,
              permanent,
              onCopy,
            ),
          ]
        : [
            copy(
              'copy-link',
              COPY_LINK,
              `Opens ${card.title} on its own — ${layout.title} does not place it`,
              permanent,
              onCopy,
            ),
          ],
      [],
    ];
  };
}
