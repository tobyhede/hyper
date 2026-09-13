import { fireEvent, screen, waitFor, within } from '@testing-library/react';

/**
 * How a test reaches the application's command surface.
 *
 * Every one of these was a single control on the Space Sidebar and is a
 * disclosure on the Command Dock: the Sidebar had room for a permanent `Add
 * Thing`, a permanent `Add Diagram` and a Present button because it was a column
 * sixteen rem wide, and the Dock is a strip over the canvas that finds room by
 * disclosure instead (ADR 0082). So a test that used to press one button now
 * opens a menu and presses a row.
 *
 * They live here rather than in each suite because the *surface* changed and the
 * claims did not: twenty tests across six files assert what happens after Add
 * Thing, and none of them is about how Add Thing is reached. One module is what
 * stops the next change to the Dock being a change to twenty files — and what
 * stops six of them quietly settling on six different ways to press it.
 *
 * None of this is a harness. Every control below is the production one the
 * application draws, addressed the way a reader reaches it.
 */

/**
 * Whether a Dock control is unavailable.
 *
 * `aria-disabled`, not the `disabled` attribute: ADR 0073 keeps a toolbar item
 * focusable while it is unavailable, so it announces itself rather than being
 * drawn and unreachable — and Base UI's menu items do the same. `toBeDisabled()`
 * reads the attribute and would call every one of these available.
 */
export const unavailable = (control: HTMLElement): boolean =>
  control.getAttribute('aria-disabled') === 'true';

/**
 * Begin the inline rename of a Dock identity, once it may begin.
 *
 * All three names are renameable now — `renamed-space` joined `renamed-diagram`
 * and `renamed-graph` — and all three are withdrawn together, by the one
 * `chromeTitleEdit` guard. The name itself is the identity's disclosure, so a
 * test that used to press the word now opens that list and chooses Rename
 * (`.scratch/command-dock/issues/26-identity-clusters-disclose-from-the-name.md`).
 *
 * The wait is on the Rename row rather than the trigger: switching stays
 * reachable while a chrome title edit is withdrawn, and only the command that
 * would begin one is unavailable.
 */
export const beginRename = async (
  testId: 'space-title' | 'selected-canvas' | 'active-graph',
): Promise<void> => {
  if (screen.queryByRole('textbox', { name: IDENTITY_EDITOR[testId] }) !== null) return;
  const title = await waitFor(() => {
    const name = screen.getByTestId(testId).textContent;
    expect(name).toBeTruthy();
    return name;
  });
  IDENTITY_MENU[testId](title);
  const rename = await waitFor(() => {
    const item = screen.getByRole('menuitem', { name: 'Rename' });
    expect(unavailable(item)).toBe(false);
    return item;
  });
  fireEvent.click(rename);
};

const IDENTITY_EDITOR = {
  'space-title': 'Space name',
  'selected-canvas': 'Diagram name',
  'active-graph': 'Graph name',
} as const;

const IDENTITY_MENU = {
  'space-title': (title: string) => {
    openSpaceMenu(title);
  },
  'selected-canvas': (title: string) => {
    openDiagramMenu(title);
  },
  'active-graph': (title: string) => {
    openGraphMenu(title);
  },
} as const;

/** The Rename command on one identity, after opening that identity's list. */
export const identityRenameItem = (
  testId: 'space-title' | 'selected-canvas' | 'active-graph',
): HTMLElement => {
  IDENTITY_MENU[testId](screen.getByTestId(testId).textContent);
  return screen.getByRole('menuitem', { name: 'Rename' });
};

/**
 * When New Diagram may continue in the new name.
 *
 * Waited on the continuation address rather than by opening the Diagram list:
 * a Base UI menu returns focus to its trigger in a microtask after it closes,
 * and a poll that opened and dismissed this one would steal the caret from
 * the editor the continuation opens.
 */
export const waitUntilDiagramContinuationReady = async (): Promise<void> => {
  await waitFor(() => {
    const control = document.querySelector<HTMLButtonElement>(
      '[data-continuation-control="diagram-name"]',
    );
    expect(control).not.toBeNull();
    expect(control?.disabled).toBe(false);
  });
};

/** The bar itself, named as its own toolbar. */
export const dock = (): HTMLElement => screen.getByRole('toolbar', { name: 'Command Dock' });

/**
 * Create a Thing of one kind.
 *
 * The two kinds are peer controls in the Things cluster — the kind is chosen at
 * creation, so neither is a default, and no disclosure stands in front of them.
 * One press per creation, whichever kind, and the Edit completes on that press
 * (ADR 0089). An Alias is not among them: it is created from the Thing it points
 * at, through that Thing's own command menu.
 */
export const createThing = (kind: ThingKindName): void => {
  fireEvent.click(createThingControl(kind));
};

/** The kinds the Dock offers, named as their controls announce them. */
export type ThingKindName = 'Markdown Thing' | 'Space Thing';

/**
 * One kind's Create control.
 *
 * Each peer withdraws on its own answer — Add Markdown Thing on `addThing`,
 * Create Space Thing also while its coordinated Edit is in flight — so name the
 * kind when asserting availability.
 */
export const createThingControl = (kind: ThingKindName = 'Markdown Thing'): HTMLElement =>
  within(dock()).getByRole('button', { name: `Create ${kind}` });

/**
 * The Diagram cluster's disclosure: the authored Diagrams, then the commands on
 * the one that is drawing.
 *
 * Named for the Diagram it is showing, which is what the cluster announces.
 */
export const openDiagramMenu = (title: string): void => {
  // Dismissed first if something else in the bar is open. At most one Dock
  // disclosure is open at a time — one open id under the whole row — so a press
  // on this trigger while another is open is an *outside* press that Base UI
  // spends on dismissing, and the menu this asked for never appears.
  //
  // `hidden: true`, because a Thing title editor marks the rest of the tree
  // inert and a role query otherwise cannot see the menu it has to dismiss.
  dismissOpenMenu();
  fireEvent.click(within(dock()).getByRole('button', { name: `Diagram: ${title}` }));
};

const dismissOpenMenu = (): void => {
  const open = screen.queryByRole('menu', { hidden: true });
  if (open !== null) fireEvent.keyDown(open, { key: 'Escape' });
};

/** New Diagram, and whether it may run — its availability is its own (ADR 0065). */
export const newDiagramItem = (diagramTitle: string): HTMLElement => {
  openDiagramMenu(diagramTitle);
  return screen.getByRole('menuitem', { name: 'New Diagram' });
};

/** New Diagram, which creates and selects an empty Diagram owning one empty Graph. */
export const newDiagram = (title: string): void => {
  fireEvent.click(newDiagramItem(title));
};

/**
 * Present, which traverses the Active Graph.
 *
 * It is the one command on the Graph cluster with a control of its own, because
 * traversing is what a Graph is *for* — so it is named for the Graph it acts on
 * rather than sitting under a generic label.
 */
export const presentControl = (graphTitle: string): HTMLElement =>
  within(dock()).getByRole('button', { name: `Present ${graphTitle}` });

/** Present, where the Graph's own title is not what the test is about. */
export const anyPresentControl = (): HTMLElement =>
  within(dock()).getByRole('button', { name: /^Present / });

/**
 * The open Spaces, and the mark on the one that is unwell.
 *
 * The Sidebar drew the set as a strip of vertical tabs beside it; the Dock
 * discloses the same set from the bar, as the tree the Opener makes (ADR 0082
 * leaves which surface draws it as treatment). The row still says *which* Space
 * needs a decision and says it in `openSpaceStatusLabel`'s words, so a Space
 * that went wrong while the reader was elsewhere is still distinguishable from
 * one that is fine.
 */
export const openSpacesMenu = (): void => {
  fireEvent.click(within(dock()).getByRole('button', { name: /^Spaces\./ }));
};

export const openSpaceRow = (title: RegExp | string): HTMLElement =>
  screen.getByRole('menuitemradio', { name: title });

/**
 * Present, reached from under a modal creation pane.
 *
 * A pane hides the rest of the tree from assistive technology, so a role query
 * cannot see the bar behind it — and a reader cannot press it either. The claim
 * a test spends this on is not that the control is reachable; it is what the
 * application does *when* a presentation begins, which is also reachable by
 * Back onto a presenting Thing's URL with the pane still up. Naming the exception
 * here keeps it one exception rather than a habit.
 */
export const presentControlBehindAModal = (graphTitle: string): HTMLElement =>
  screen.getByRole('button', { name: `Present ${graphTitle}`, hidden: true });

/**
 * Delete, on the Diagram the cluster is showing.
 *
 * Two rules meet on this one row and neither implies the other: the last Diagram
 * cannot be deleted (ADR 0079), and *no* entity Edit may run while a title
 * editor or a live content edit owns the caret. A row that reads only the first
 * is drawn available for a command the application has already withdrawn.
 */
export const deleteDiagramItem = (diagramTitle: string): HTMLElement => {
  openDiagramMenu(diagramTitle);
  return screen.getByRole('menuitem', { name: `Delete ${diagramTitle}` });
};

/**
 * The Graph cluster's disclosure: the Graphs this Diagram owns, then its commands.
 *
 * Dismissed first for the reason {@link openDiagramMenu} is: one open id under
 * the whole row means a press on this trigger while another cluster is open is
 * an outside press Base UI spends on dismissing.
 */
export const openGraphMenu = (title: string): void => {
  dismissOpenMenu();
  fireEvent.click(within(dock()).getByRole('button', { name: `Active Graph: ${title}` }));
};

/** New Graph, and whether it may run — an entity Edit like every other. */
export const newGraphItem = (graphTitle: string): HTMLElement => {
  openGraphMenu(graphTitle);
  return screen.getByRole('menuitem', { name: 'New Graph' });
};

/**
 * The Space cluster's disclosure: New Space, Copy link, the open set and Exit.
 *
 * Dismissed first for the reason {@link openDiagramMenu} is.
 */
export const openSpaceMenu = (title: string): void => {
  dismissOpenMenu();
  fireEvent.click(within(dock()).getByRole('button', { name: `Space: ${title}` }));
};

/** Exit Space, and whether it may run — which is a question about the meta Space. */
export const exitSpaceItem = (spaceTitle: string): HTMLElement => {
  openSpaceMenu(spaceTitle);
  return screen.getByRole('menuitem', { name: 'Exit Space' });
};
