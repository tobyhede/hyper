/**
 * What the Command Dock's clusters share: how a disclosure opens, the Dock's
 * one open slot, the one rename slot, and the caret note an identity's menu
 * reads on close.
 *
 * Contexts, hooks and constants rather than components, so the modules that
 * draw the clusters keep their Fast Refresh boundaries. `CommandDock.tsx`
 * provides both contexts; each cluster module consumes them.
 */
import { createContext, useContext, useId, type MutableRefObject, type ReactNode } from 'react';

/**
 * Every disclosure opens the same way, whichever primitive draws it.
 *
 * A Popover and a Menu are two components because their *content* differs — one
 * scrolls a filtered list you drag out of, the other is a short exclusive set —
 * and which component that is, is an implementation detail. Where a surface
 * appears, how wide it is and how far it sits off its trigger are not: those
 * are the same question asked of every control in the bar, and a reader who
 * learns the answer at one cluster is owed it at the next.
 *
 * Centred on the trigger rather than aligned to its start. Every trigger here
 * is an icon-width chevron, so a start-aligned surface hangs off one edge of a
 * 28px button and reads as belonging to whatever sits beside it.
 */
export const DISCLOSURE_ALIGN = 'center' as const;
export const DISCLOSURE_SIDE_OFFSET = 6;
export const DISCLOSURE_WIDTH = 'w-72';

/** Which of the bar's three names a rename can be running on. */
export type DockIdentity = 'Space' | 'Map' | 'Graph';

export const identityDisclosureName = (kind: DockIdentity, title: string): string =>
  kind === 'Graph' ? `Active Graph: ${title}` : `${kind}: ${title}`;

export type IdentityDisclosure = {
  readonly trigger: ReactNode;
  readonly renameItem: ReactNode;
  readonly triggerId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

/**
 * Whether a command that closed this identity's list left the caret alone.
 *
 * Held on a ref because it decides nothing that is rendered — it is a note
 * from the press to the close that follows it. The functions that read it
 * are JSX props on the menu, not arguments to this surface's render prop:
 * passing a ref-backed function through a function called during render is
 * what `react-hooks/refs` reports.
 */
export const IdentityCaretContext = createContext<MutableRefObject<boolean> | null>(null);

export function useIdentityCaret() {
  const caretMovedRef = useContext(IdentityCaretContext);
  if (caretMovedRef === null) {
    throw new Error('Identity caret used outside IdentitySurface');
  }
  return {
    noteCaretMoved: () => {
      caretMovedRef.current = true;
    },
    restoresFocusOnClose: () => {
      const moved = caretMovedRef.current;
      caretMovedRef.current = false;
      return !moved;
    },
  };
}

/**
 * Which of the Dock's list disclosures is open, if any.
 *
 * A `Menubar` makes the Dock's *menus* exclusive, but the Resources list is a
 * Popover rather than a menu — it holds a filter field and drag sources, and
 * menu semantics would take the arrow keys and typeahead the input needs and
 * would dismiss on activating a row. So the exclusivity a menubar gives its
 * menus is supplied here across both kinds: one open id for the Dock, and
 * whichever control opens next clears whatever was open.
 *
 * A context rather than props threaded through the clusters: each already takes
 * `chrome` and `side`, and a further pair carried through two components purely
 * to reach a leaf is the shape that makes the next person reintroduce local
 * state instead.
 */
export interface DockDisclosure {
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
}

export const DockDisclosureContext = createContext<DockDisclosure>({
  openId: null,
  setOpenId: () => undefined,
});

/**
 * Which name in the bar is being renamed, if any.
 *
 * **One slot, exactly as the disclosure above is one open id.** Renaming and
 * disclosing are the same rule twice: at most one at a time, and whichever
 * control begins next clears whatever was open. Each identity used to keep its
 * own `editing` boolean and report into the application's single
 * `editingChromeTitle`, which meant two editors could stand at once and the
 * first of them to close told the application that neither was — handing back
 * the commands the other was still withdrawing. A slot cannot say that: the
 * fact is the bar's, so it is held once and read by every name.
 *
 * A context for the same reason the disclosure is one: threading it through
 * `SpacesControl`, `MapControls` and `GraphControls` to reach a leaf is the
 * shape that makes the next person keep it locally instead. The default is an
 * inert slot, so an identity mounted outside a provider draws its name and
 * never opens an editor, rather than opening one nothing can end.
 */
export interface DockRenaming {
  readonly renaming: DockIdentity | null;
  /** Take the slot for one identity, or release it. */
  readonly onRenaming: (identity: DockIdentity | null) => void;
}

export const DockRenamingContext = createContext<DockRenaming>({
  renaming: null,
  onRenaming: () => undefined,
});

/**
 * One disclosure's share of the Dock's single open slot.
 *
 * **Base UI's `Menubar` is the documented answer and it cannot be used here.**
 * It is a roving-focus container, and so is `Toolbar` — and the Dock is a
 * Toolbar because ADR 0073 makes a command cluster the component a Resource rail is
 * built from. Nesting them puts `role="menubar"` inside `role="toolbar"` and two
 * focus managers over the same buttons: the menu opens, the toolbar takes focus
 * back, and it closes again within a frame. It fails silently, with nothing in
 * the console, which from the outside is a menu that flashes on click and never
 * opens.
 *
 * So the exclusivity a menubar would have supplied is supplied by controlled
 * open state, which both `Menu.Root` and `Popover.Root` accept. That is not a
 * hand-rolled interaction: every dismissal, focus trap and key belongs to Base
 * UI still, and the only choice owned here is *which one* is open.
 *
 * **The id is also the trigger's.** A controlled Base UI root — `Menu.Root` as
 * much as `Popover.Root` — has to be told which element it belongs to: without
 * `triggerId` on the root and the same `id` on the trigger, `open` opens
 * nothing at all and does it silently, which is the second way this surface has
 * now produced a menu that flashes and never appears.
 *
 * The id is `useId` rather than a caller-chosen string, so two disclosures
 * cannot collide by both calling themselves "resources" and adding a control needs
 * no registry kept in step.
 */
export interface DisclosureBinding {
  readonly id: string;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}

export function useDockDisclosure() {
  const id = useId();
  const { openId, setOpenId } = useContext(DockDisclosureContext);
  return {
    id,
    open: openId === id,
    onOpenChange: (next: boolean) => setOpenId(next ? id : null),
  } satisfies DisclosureBinding;
}

/**
 * The Resources disclosure's id, and the one in the Dock that is not a `useId`.
 *
 * Every other disclosure takes an opaque generated id, so two cannot collide by
 * both calling themselves "resources" (see {@link useDockDisclosure}). This one is
 * named because it is the one disclosure the Dock itself opens on the
 * application's behalf — a Map just created, a Resource addressed that the
 * Map does not place — and {@link DockChrome} has to be able to seed the
 * Dock's slot with it before any control has mounted to mint an id.
 */
export const RESOURCES_DISCLOSURE_ID = 'command-dock-resources';
