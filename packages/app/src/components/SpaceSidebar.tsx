import { useState, type ReactNode } from 'react';
import {
  type Card,
  type Graph,
  type GraphId,
  type Layout,
  type LayoutId,
  type UUID,
} from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  AddCardControl,
  Alert,
  AlertDescription,
  AlertIcon,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Button,
  buttonVariants,
  CardKindIcon,
  cn,
  EntityActions,
  EntityActionsIcon,
  EntityActionsTrigger,
  FALLBACK_GRAPH_COLOR,
  GraphIcon,
  graphColor,
  LayoutIcon,
  InlineTitleEditor,
  PresentIcon,
  StopPresentingIcon,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@project/ui';
import type { EntityAction, EntityActionGroup, EntityActionOutcome } from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringRefusal } from '../space-authoring';

/**
 * The id of the one entity command whose *outcome* decides the mobile Sheet's
 * dismissal rather than preceding it (see `onCanvasOutcome` below).
 *
 * Exported so the module that builds that command spells it from here instead
 * of from a second literal that happens to agree. The pairing is invisible at
 * both ends: a rename on either side compiles, every hand-written command list
 * in the tests goes on passing, and the only symptom is a Sheet that stops
 * dismissing below the breakpoint over a canvas that has already changed.
 *
 * It is declared with the `entityActions` prop rather than beside the command
 * because it is a fact about that prop's contract — *whoever* supplies the
 * commands, this is the id the Sidebar wraps — and because the Sidebar takes
 * its commands as a prop precisely so it need not name a producer.
 */
export const DELETE_LAYOUT_ACTION_ID = 'delete-layout';

export interface SpaceSidebarProps {
  readonly sessionActions?: ReactNode;
  /** The Space's title. The canvas header names what is drawing it (ADR 0053). */
  readonly spaceTitle: string;
  /**
   * How this sidebar collapses, passed straight to the primitive. Defaults to
   * the application's `offcanvas`.
   *
   * `none` exists for Open Spaces: shadcn's own `sidebar-09` composes
   * several sidebars by nesting `collapsible="none"` ones inside a single
   * collapsible root, so the root keeps the offcanvas behaviour, `cmd/ctrl+B`
   * and the mobile Sheet while each nested sidebar is a plain column.
   */
  readonly collapsible?: 'offcanvas' | 'icon' | 'none';
  /**
   * Passed to the primitive. A Space Sidebar inside Open Spaces gives up the
   * `w-(--sidebar-width)` the root reserves because the entries and the active
   * Sidebar share that fixed width.
   */
  readonly className?: string;
  readonly canvas: {
    /** The Space's authored Layouts, in the order it declares them. */
    readonly layouts: readonly Layout[];
    /**
     * The Layout that is drawing.
     *
     * Matched to a row by **Layout id** and not by object identity. The
     * interface is structural, so "this came out of that list" is a thing a
     * hand-built literal can break and the compiler cannot check; making the
     * pressed test compare ids means it does not have to. A caller that lists
     * one Space's Layouts and takes its selected Layout from a second value of
     * equal shape presses the right row rather than none.
     */
    readonly selected: Layout;
    /**
     * Hands back the bare Layout id, which is what Navigation takes. The
     * Layout's title belongs to the Layout: a caller that has to name what is
     * drawing reads `selected` rather than deriving a second title of its own.
     */
    readonly onSelect: (selection: LayoutId) => void;
  };
  readonly graph: {
    readonly graphs: readonly Graph[];
    readonly colorByGraphId: Readonly<Record<string, string>>;
    readonly activeGraphId: string | null;
    readonly onActivate: (graphId: GraphId) => void;
    readonly onPresent: () => void;
    /**
     * Whether presenting may start. False while a content edit is running:
     * presenting draws the Card's content in place of the Card, so a live
     * editor cannot survive it and its draft would go with no exit spent
     * (ADR 0064).
     */
    readonly canPresent?: boolean;
    readonly presenting?: boolean;
    readonly onExitPresenting: () => void;
  };
  readonly addCard: {
    readonly onAddCard: () => void;
    readonly onAddAlias: () => void;
    readonly onAddSpaceCard: () => void;
    readonly disabled?: boolean;
    readonly keyShortcut?: string;
    readonly hidden?: boolean;
  };
  readonly createLayout: {
    readonly disabled?: boolean;
    readonly refusal: AuthoringRefusal | null;
    readonly onCreate: () => void;
  };
  readonly persistence: {
    readonly control: ReactNode;
    readonly state: SpaceSessionState['persistence']['kind'];
    readonly acknowledgedRevision: bigint;
  };
  /**
   * The Card the canvas has selected, named in the footer so its own actions
   * menu has an entity to hang off.
   *
   * The Card itself rather than a title and a pair of copy callbacks: its
   * addresses are `entityActions`' to build now, exactly as a Layout's and a
   * Graph's are, and handing this surface a title would leave it naming a Card
   * down a second path from the one the menu is built over.
   */
  readonly selectedCard?:
    | {
        readonly card: Card;
        /**
         * Delete this Card from the whole Space, answering a refusal to show in
         * place.
         *
         * Allowed to answer a promise, because one kind of Card genuinely
         * cannot answer synchronously: a Space Card's deletion is a coordinated
         * Edit across every Space it takes with it (ADR 0076). Which kind it is
         * the confirmation reads off the `card` beside this, rather than being
         * told twice.
         */
        readonly onDelete?: (() => string | null | Promise<string | null>) | undefined;
      }
    | undefined;
  /**
   * What commands each entity in this Sidebar offers, asked one entity at a
   * time. Absent leaves every row exactly as it was.
   *
   * A function rather than a built list, because the two things these commands
   * are made of are not the Sidebar's: an address comes from the product
   * destination table (ADR 0069, ADR 0072) and a rename runs a completed Edit.
   * The Sidebar knows which entities it is drawing and where their controls go;
   * what a command *is* stays with the composition that already owns both.
   */
  readonly entityActions?: (entity: SpaceEntity) => readonly EntityActionGroup[];
  readonly titleEdit?: SpaceChromeTitleEdit;
}

/**
 * What deleting this Card destroys, said before it is confirmed.
 *
 * The two sentences are one rule read at two scopes. An ordinary Card is the
 * Space's own, so the loss is bounded by the Space the author is looking at. A
 * Space Card owns its target's lifetime together with every other reference to
 * it, so the same gesture can reach work in Spaces that are not on screen (ADR
 * 0074) — and V1 has no undo, which is why that is stated rather than merely
 * true.
 */
const DELETES_THE_CARD =
  'This removes the Card from the Space, every Layout that contains it, and every Edge connected to it.';

const DELETION_DESCRIPTIONS = {
  markdown: DELETES_THE_CARD,
  alias: DELETES_THE_CARD,
  space: `${DELETES_THE_CARD} If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.`,
  // Exhaustive over the kinds rather than a default plus one exception, so a
  // fourth kind has to decide what its deletion destroys before it compiles.
} satisfies Record<Card['kind'], string>;

function DeleteCardControl({
  title,
  kind,
  onDelete,
}: {
  readonly title: string;
  readonly kind: Card['kind'];
  readonly onDelete: () => string | null | Promise<string | null>;
}) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Escape is an exit, and both exits are withheld while a Delete runs —
        // the two buttons are disabled but Base UI closes on Escape whatever
        // they are doing. Left alone it would answer into a dialog that had
        // gone, and a refusal is only cleared on close, so the next opening
        // would lead with a message about an attempt the author abandoned.
        if (!next && deleting) return;
        setOpen(next);
        if (!next) setRefusal(null);
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="destructive" size="compact" className="w-full" />}
      >
        Delete Card {title}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Card {title}?</AlertDialogTitle>
          <AlertDialogDescription>{DELETION_DESCRIPTIONS[kind]}</AlertDialogDescription>
        </AlertDialogHeader>
        {refusal === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Card not deleted</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              // `preventBaseUIHandler`, not `preventDefault`: Base UI's
              // `mergeProps` runs the primitive's own close handler unless the
              // consumer sets `baseUIHandlerPrevented`, and it never reads
              // `defaultPrevented`. It is set unconditionally now rather than
              // only for a refusal, because one Card kind answers a promise and
              // the primitive would have closed the dialog long before the
              // refusal it might carry arrived. Closing is this component's
              // either way.
              event.preventBaseUIHandler();
              setDeleting(true);
              // An async function body runs synchronously up to its first
              // `await`, so `onDelete` is still called on this click — the
              // synchronous kinds answer synchronously and a caller may assert
              // on that — while one `catch` covers a throw and a rejection
              // alike. Both reach it: `complete` throws for a Space that has
              // stopped loading, and the coordinated Edit a Space Card runs can
              // reject. An event handler is not something a React error
              // boundary catches, so a failure left to escape would leave the
              // running state behind, and both of this dialog's exits are
              // withheld while it stands.
              void (async () => {
                try {
                  const nextRefusal = await onDelete();
                  setDeleting(false);
                  setRefusal(nextRefusal);
                  // A refusal has nowhere to be read but this dialog, so the
                  // dialog has to stay.
                  if (nextRefusal === null) setOpen(false);
                } catch (failure) {
                  // Not a refusal, and deliberately not translated into one: a
                  // refusal code is a stable domain identity (ADR 0057) and
                  // nothing here answers to one.
                  setDeleting(false);
                  setRefusal(failure instanceof Error ? failure.message : String(failure));
                }
              })();
            }}
          >
            Delete Card
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * An entity this Sidebar draws a row for, named the way the row knows it.
 *
 * It carries the whole `Layout`/`Graph` rather than an id, for the reason
 * `SelectedLayoutName` takes the Layout: handed an id, a caller has to find
 * the thing again down a second path, and the Sidebar and the menu on its own
 * row are then free to disagree about what they are naming.
 */
export type SpaceEntity =
  | { readonly kind: 'space' }
  | { readonly kind: 'layout'; readonly layout: Layout }
  | { readonly kind: 'graph'; readonly graph: Graph; readonly layout: Layout }
  | { readonly kind: 'card'; readonly card: Card; readonly layout: Layout };

export interface SpaceChromeTitleEdit {
  readonly subject: SpaceChromeTitleSubject | null;
  readonly surface: 'sidebar' | 'header' | null;
  readonly draft: string;
  readonly error: string | null;
  readonly disabled?: boolean;
  readonly onBegin: (
    subject: SpaceChromeTitleSubject,
    title: string,
    surface: 'sidebar' | 'header',
  ) => void;
  readonly onDraftChange: (draft: string) => void;
  readonly onErrorChange: (error: string | null) => void;
  readonly onComplete: (subject: SpaceChromeTitleSubject, title: string) => string | null;
  readonly onCancel: () => void;
  /**
   * Ask for the caret back where this rename was begun.
   *
   * The caller answers with a continuation rather than a captured element: this
   * fires from inside the editor's own key handler, before React has swapped
   * the row's branch back, so the element the row is addressed by is the
   * unfocusable one at the moment it is asked (`continuation.ts`).
   */
  readonly onReturnFocus: () => void;
}

export type SpaceChromeTitleSubject =
  | {
      readonly kind: 'layout';
      readonly id: UUID;
    }
  | { readonly kind: 'graph'; readonly id: GraphId };

const editing = (
  edit: SpaceChromeTitleEdit | undefined,
  kind: 'layout' | 'graph',
  id: string,
): boolean => edit?.subject?.kind === kind && edit.subject.id === id;

/** The selectable Layout rows. */
function LayoutRows({
  layouts,
  selected,
  onSelect,
  titleEdit,
  entityActions,
}: {
  readonly layouts: readonly Layout[];
  readonly selected: Layout;
  readonly onSelect: (selection: LayoutId) => void;
  readonly titleEdit: SpaceChromeTitleEdit | undefined;
  readonly entityActions: SpaceSidebarProps['entityActions'];
}) {
  return (
    <SidebarMenu>
      {layouts.map((layout) => {
        const active = layout.id === selected.id;
        const layoutId = layout.id;
        const isEditing =
          editing(titleEdit, 'layout', layoutId) && titleEdit?.surface === 'sidebar';
        const shownTitle = editing(titleEdit, 'layout', layoutId)
          ? (titleEdit?.draft ?? layout.title)
          : layout.title;
        return (
          <SidebarMenuItem key={layoutId} tabIndex={-1}>
            <EntityActionsRow
              entity={{ kind: 'layout', layout }}
              entityActions={entityActions}
              label={`Actions for Layout ${layout.title}`}
              editing={isEditing}
            >
              {isEditing ? (
                // The row keeps its addressing hooks while its own rename is
                // live: an open pane marks the root `inert`, so `data-layout-id`
                // is how a covered Sidebar is reached at all (docs/agents/ui.md),
                // and it is what returns the caret here afterwards.
                // `aria-pressed` is not carried across — this branch renders a
                // `div`, and pressed state on a non-button is not a thing to say.
                <SidebarMenuButton
                  render={<div />}
                  isActive={active}
                  data-testid="layout-row"
                  data-layout-id={layoutId}
                >
                  <LayoutIcon />
                  <InlineTitleEditor
                    className="flex-1"
                    title={layout.title}
                    label="Layout name"
                    variant="sidebar"
                    draft={titleEdit.draft}
                    error={titleEdit.error}
                    onDraftChange={titleEdit.onDraftChange}
                    onErrorChange={titleEdit.onErrorChange}
                    onComplete={(title) =>
                      titleEdit.onComplete({ kind: 'layout', id: layoutId }, title)
                    }
                    onCancel={titleEdit.onCancel}
                    onReturnFocus={titleEdit.onReturnFocus}
                  />
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  isActive={active}
                  aria-pressed={active}
                  data-testid="layout-row"
                  data-layout-id={layoutId}
                  onClick={() => {
                    if (active && titleEdit !== undefined && titleEdit.disabled !== true) {
                      titleEdit.onBegin({ kind: 'layout', id: layoutId }, layout.title, 'sidebar');
                    } else {
                      onSelect(layoutId);
                    }
                  }}
                >
                  <LayoutIcon />
                  <span>{shownTitle}</span>
                </SidebarMenuButton>
              )}
            </EntityActionsRow>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/**
 * A row that answers a right click and carries a trailing menu icon, or the row
 * exactly as it was when nothing supplies its commands.
 *
 * Both paths open the same list, which is `EntityActions`' and
 * `EntityActionsTrigger`'s doing rather than this module's. What is decided
 * here is only *where* on a Sidebar row the icon goes: `SidebarMenuAction`,
 * hover- and focus-revealed, which is the registry Sidebar's own trailing-action
 * slot and already resolves to permanently visible below the `md` breakpoint
 * where there is no hover to reveal it with.
 *
 * Withheld while the row's title is being edited: the icon's slot is where the
 * editor's own box now is, and a menu offering Rename over a live rename is
 * offering a second start to an Edit already running.
 */
function EntityActionsRow({
  entity,
  entityActions,
  label,
  editing: isEditing,
  children,
}: {
  readonly entity: SpaceEntity;
  readonly entityActions: SpaceSidebarProps['entityActions'];
  readonly label: string;
  readonly editing: boolean;
  readonly children: ReactNode;
}) {
  if (entityActions === undefined) return children;
  const groups = entityActions(entity);
  if (!groups.some((group) => group.length > 0)) return children;
  if (isEditing) return children;
  return (
    <>
      <EntityActions groups={groups}>{children}</EntityActions>
      {/* A **sibling** of the right-click surface, never inside it: Base UI's
          own "Using with Menu" pattern pairs a `ContextMenu` with a `Menu`
          side by side, and a `Menu.Root` under a `ContextMenu.Root` risks
          being read as that context menu's submenu, which opens on hover
          rather than on a press.

          This is the documented shape, not a fix for the trigger being inert
          — that is still open, and un-nesting did not resolve it. */}
      <EntityActionsTrigger
        groups={groups}
        label={label}
        // The general "more" glyph, not the Card rail's link glyph. A Sidebar
        // row has no cluster of self-naming commands for a generic icon to be
        // the odd one out in, and the menu behind this one holds a rename, one
        // or two addresses and a delete — a link glyph would name a third of it.
        icon={<EntityActionsIcon />}
        render={<SidebarMenuAction showOnHover />}
      />
    </>
  );
}

/** What a group says when the Space holds none of its members yet. */
function NothingYet({ children, testId }: { readonly children: string; readonly testId: string }) {
  return (
    <p data-testid={testId} className="px-2 py-1 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The Space's command surface (ADR 0053).
 *
 * Everything persistent lives here: what draws the canvas, which Graph is
 * active, Card creation, presenting, and how saving is going. The canvas header
 * carries only the trigger that reopens this and the name of what is drawing.
 */
export function SpaceSidebar({
  sessionActions,
  spaceTitle,
  canvas,
  graph,
  addCard,
  createLayout,
  persistence,
  selectedCard,
  entityActions,
  titleEdit,
  collapsible = 'offcanvas',
  className,
}: SpaceSidebarProps) {
  // Below the primitive's breakpoint this whole surface is a modal Sheet drawn
  // *over* the canvas, with a focus trap and everything behind it inert. Every
  // command here acts on the canvas, so every one of them dismisses the sheet:
  // Add Card and Add Alias open an editor that otherwise cannot take focus at
  // all, and the rest would leave the author looking at the sidebar instead of
  // the result. A command that can be *refused* dismisses it only once it has
  // done something, because the refusal is reported on this surface — the two
  // wrappers below are that difference. Above the breakpoint the sidebar is
  // beside the canvas and there is nothing to dismiss.
  const { isMobile, setOpenMobile } = useSidebar();
  const dismissSheet = () => {
    if (isMobile) setOpenMobile(false);
  };
  /**
   * Why the one wrapped menu command *broke*, as against refusing.
   *
   * A plain sentence and not an `AuthoringRefusal`, deliberately. The refusal
   * this Sidebar already renders is a closed union of stable domain identities
   * (ADR 0057) and a thrown error answers to none of them, so translating one
   * into a refusal code would be minting a domain fact out of an accident.
   * `DeleteCardControl` below keeps a thrown message the same way and says so
   * in the same words.
   *
   * It is state here rather than the application's for the reason the failure
   * exists at all: the Delete runs an Edit, `complete` throws outright for a
   * Space that has stopped loading, and the throw happens *before* the line
   * that would have armed the application's own alert. Nothing upstream is
   * going to report it, and the author pressed the command on this surface.
   */
  const [layoutDeletionFailure, setLayoutDeletionFailure] = useState<string | null>(null);
  // Generic in what the command takes and answers alike, so a wrapped command
  // is still the command it wrapped. Every command it wraps is a control whose
  // whole result is on the canvas and that cannot be refused, so the sheet goes
  // first and nothing is waited for.
  const onCanvas =
    <Args extends readonly unknown[], Result>(command: (...args: Args) => Result) =>
    (...args: Args): Result => {
      dismissSheet();
      return command(...args);
    };
  /**
   * The menu's version of `onCanvas`, with the order inverted: run the command,
   * and dismiss the sheet only for the outcome that leaves something on the
   * canvas to look at.
   *
   * The inversion is the whole point. `delete-layout` is the one wrapped
   * command an Edit can **refuse** — the last Layout cannot go — and a refused
   * Layout Edit is reported in this Sidebar's own alert, which below this
   * breakpoint is on the sheet. Dismissing first took that surface away with
   * the sentence still on it, and the reader was told nothing. `DeleteCardControl`
   * below already closes only on a Delete that happened, for the same reason;
   * this is that rule where the outcome arrives as an `EntityActionOutcome`
   * rather than as a refusal string.
   *
   * `async` because an `onSelect` may answer with a promise, and awaiting is
   * what makes the two cases one. The synchronous answer this command gives
   * costs a microtask nobody can observe.
   *
   * The `catch` covers the third way the command can go, and it is not a
   * refusal: `complete` throws outright for a Space that has stopped loading,
   * and it throws *before* the caller's own line that arms the refusal alert,
   * so an escaping throw left the author with no message, no dismissal
   * decision, and a Sheet still up over a canvas nobody had said anything
   * about. A broken command has still less of a canvas result than a refused
   * one, so it keeps the Sheet for the same reason a refusal does — this time
   * carrying a sentence of this surface's own.
   */
  const onCanvasOutcome =
    (command: EntityAction['onSelect']) => async (): Promise<EntityActionOutcome> => {
      // A press supersedes the last one's message before it can add its own,
      // so the sentence on screen is always about the attempt just made.
      setLayoutDeletionFailure(null);
      try {
        const outcome = await command();
        if (outcome === 'done') dismissSheet();
        return outcome;
      } catch (failure) {
        setLayoutDeletionFailure(failure instanceof Error ? failure.message : String(failure));
        // The truthful outcome, which is also what withholds the dismissal.
        // The item names no words to swap its label for, so this answer is
        // read for the dismissal alone — the reporting is the alert's.
        return 'failed';
      }
    };
  const canvasAwareEntityActions: SpaceSidebarProps['entityActions'] =
    entityActions === undefined
      ? undefined
      : (entity) =>
          entityActions(entity).map((group) =>
            group.map((action) =>
              action.id === DELETE_LAYOUT_ACTION_ID
                ? { ...action, onSelect: onCanvasOutcome(action.onSelect) }
                : action,
            ),
          );

  const activeGraph = graph.graphs.find((candidate) => candidate.id === graph.activeGraphId);
  const activeGraphColor =
    activeGraph === undefined
      ? FALLBACK_GRAPH_COLOR
      : graphColor(activeGraph, graph.colorByGraphId);
  // Dead on two things, and they are one rule: there is no Card to begin at. No
  // Graph is active, or the active Graph holds no Edges — and the second is not
  // a defensive nicety. Creating a Layout creates its initial Active Graph empty
  // in the same Edit (ADR 0040), so a new Layout remains in this state until
  // the author draws something.
  const presentDisabled =
    !graph.presenting &&
    (graph.canPresent === false || activeGraph === undefined || activeGraph.edges.length === 0);

  return (
    <Sidebar collapsible={collapsible} className={className} data-testid="space-sidebar">
      <SidebarHeader className="nokey">
        {/* The Space's own actions hang off its title, not off standing
            Sidebar chrome — the entity carries its commands. There is no
            trailing-icon slot here as there is on a row, so the trigger sits
            in the title's row beside the persistence control; the right click
            covers the whole title area. */}
        <div className="group/menu-item relative flex min-w-0 items-center gap-2 px-2">
          <EntityActionsRow
            entity={{ kind: 'space' }}
            entityActions={canvasAwareEntityActions}
            label={`Actions for Space ${spaceTitle}`}
            editing={false}
          >
            <h1 data-testid="space-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
              {spaceTitle}
            </h1>
          </EntityActionsRow>
          {persistence.control}
          <span
            hidden
            aria-hidden="true"
            data-testid="persistence-status"
            data-persistence-state={persistence.state}
            data-revision={persistence.acknowledgedRevision.toString()}
          >
            {persistence.state === 'settled' ? 'Persisted' : persistence.state}
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      {/* `nokey` sits on both control-bearing regions rather than on the root.
          React Flow's live Space-key pan activation subscription reads it, and
          the mobile Sheet portals these regions somewhere a class on the root
          would not be an ancestor at all. */}
      <SidebarContent className="nokey">
        {addCard.hidden === true ? null : (
          <SidebarGroup>
            <SidebarGroupContent>
              <AddCardControl
                {...addCard}
                onAddCard={onCanvas(addCard.onAddCard)}
                onAddAlias={onCanvas(addCard.onAddAlias)}
                onAddSpaceCard={onCanvas(addCard.onAddSpaceCard)}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Layout</SidebarGroupLabel>
          <SidebarGroupContent>
            {canvas.layouts.length === 0 ? (
              <NothingYet testId="no-authored-layouts">No Layouts yet.</NothingYet>
            ) : (
              <LayoutRows
                layouts={canvas.layouts}
                selected={canvas.selected}
                onSelect={onCanvas(canvas.onSelect)}
                titleEdit={titleEdit}
                entityActions={canvasAwareEntityActions}
              />
            )}
            <div className="mt-2 space-y-2">
              <Button
                variant="default"
                size="compact"
                className="w-full justify-start gap-2"
                disabled={createLayout.disabled}
                onClick={onCanvas(createLayout.onCreate)}
              >
                <LayoutIcon />
                Add Layout
              </Button>
              {createLayout.refusal === null ? null : (
                <Alert variant="destructive">
                  <AlertIcon />
                  <AlertTitle>Layout unchanged</AlertTitle>
                  <AlertDescription>
                    {describeAuthoringRefusal(createLayout.refusal)}
                  </AlertDescription>
                </Alert>
              )}
              {/* Beside the refusal alert rather than in place of it: this is
                  where a Layout Edit that did not happen is already read, and
                  the two are about different attempts. Its own title, because
                  "unchanged" is what a refusal says and a command that broke
                  cannot promise even that much. */}
              {layoutDeletionFailure === null ? null : (
                <Alert variant="destructive">
                  <AlertIcon />
                  <AlertTitle>Layout not deleted</AlertTitle>
                  <AlertDescription>{layoutDeletionFailure}</AlertDescription>
                </Alert>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Graphs</SidebarGroupLabel>
          <SidebarGroupContent>
            <Button
              variant="secondary"
              size="compact"
              className="mb-2 w-full justify-start gap-2"
              data-testid={graph.presenting ? 'exit-presenting-button' : 'present-button'}
              disabled={presentDisabled}
              onClick={onCanvas(graph.presenting ? graph.onExitPresenting : graph.onPresent)}
            >
              {graph.presenting ? (
                <StopPresentingIcon color={activeGraphColor} />
              ) : (
                <PresentIcon color={activeGraphColor} />
              )}
              {graph.presenting ? 'Stop' : 'Present'}
            </Button>
            {graph.graphs.length === 0 ? (
              <NothingYet testId="no-graphs">None yet — the first Layout mints one.</NothingYet>
            ) : (
              <SidebarMenu>
                {graph.graphs.map((candidate) => {
                  const active = candidate.id === graph.activeGraphId;
                  const isEditing = editing(titleEdit, 'graph', candidate.id);
                  return (
                    <SidebarMenuItem key={candidate.id} tabIndex={-1}>
                      <EntityActionsRow
                        entity={{ kind: 'graph', graph: candidate, layout: canvas.selected }}
                        entityActions={canvasAwareEntityActions}
                        label={`Actions for Graph ${candidate.title}`}
                        editing={isEditing}
                      >
                        {isEditing && titleEdit !== undefined ? (
                          <SidebarMenuButton
                            render={<div />}
                            isActive={active}
                            data-testid="graph-choice"
                            data-graph-id={candidate.id}
                          >
                            <GraphIcon color={graphColor(candidate, graph.colorByGraphId)} />
                            <InlineTitleEditor
                              className="flex-1"
                              title={candidate.title}
                              label="Graph name"
                              variant="sidebar"
                              draft={titleEdit.draft}
                              error={titleEdit.error}
                              onDraftChange={titleEdit.onDraftChange}
                              onErrorChange={titleEdit.onErrorChange}
                              onComplete={(title) =>
                                titleEdit.onComplete({ kind: 'graph', id: candidate.id }, title)
                              }
                              onCancel={titleEdit.onCancel}
                              onReturnFocus={titleEdit.onReturnFocus}
                            />
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            isActive={active}
                            aria-pressed={active}
                            data-testid="graph-choice"
                            data-graph-id={candidate.id}
                            onClick={() => {
                              if (
                                active &&
                                titleEdit !== undefined &&
                                titleEdit.disabled !== true
                              ) {
                                titleEdit.onBegin(
                                  { kind: 'graph', id: candidate.id },
                                  candidate.title,
                                  'sidebar',
                                );
                              } else {
                                onCanvas(graph.onActivate)(candidate.id);
                              }
                            }}
                          >
                            <GraphIcon color={graphColor(candidate, graph.colorByGraphId)} />
                            <span>{candidate.title}</span>
                          </SidebarMenuButton>
                        )}
                      </EntityActionsRow>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="nokey">
        {sessionActions}
        {selectedCard !== undefined && (
          <div className="grid gap-1">
            {/* The selected Card as a row of its own, so its addresses hang off
                the entity the way a Layout's and a Graph's do rather than
                standing as two more buttons in the footer. It is a
                `SidebarMenuButton` over a `div`: there is nothing to press
                here — the Card is already selected, on the canvas — and the
                row exists to be the thing the menu and the right click are
                *about*. */}
            <SidebarMenu>
              <SidebarMenuItem tabIndex={-1}>
                <EntityActionsRow
                  entity={{ kind: 'card', card: selectedCard.card, layout: canvas.selected }}
                  entityActions={canvasAwareEntityActions}
                  label={`Actions for Card ${selectedCard.card.title}`}
                  editing={false}
                >
                  <SidebarMenuButton
                    render={<div />}
                    data-testid="selected-card-row"
                    data-card={selectedCard.card.id}
                  >
                    <CardKindIcon kind={selectedCard.card.kind} />
                    <span>{selectedCard.card.title}</span>
                  </SidebarMenuButton>
                </EntityActionsRow>
              </SidebarMenuItem>
            </SidebarMenu>
            {selectedCard.onDelete !== undefined && (
              <DeleteCardControl
                title={selectedCard.card.title}
                kind={selectedCard.card.kind}
                /* `onCanvas` by hand rather than by the helper: only a
                   *completed* Delete has a canvas result to dismiss the sheet
                   for. A refusal keeps the dialog open (`DeleteCardControl`
                   below), and dismissing the sheet under it would take the
                   surface the sentence is on with it. */
                onDelete={async () => {
                  const refusal = (await selectedCard.onDelete?.()) ?? null;
                  if (refusal === null && isMobile) setOpenMobile(false);
                  return refusal;
                }}
              />
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * What the canvas header says: the name of the Layout drawing the canvas.
 *
 * Separate from the sidebar it reports on, because it sits in the inset and
 * survives the sidebar closing — the single choice is still named when the list
 * it was made in is off screen.
 *
 * It takes the **Layout**, never a bare title and id. Handed those two, a
 * caller can name what is drawing down a second path and the header and the
 * list it reports on are free to disagree again. Taking the Layout means the
 * header and the row are reading one value.
 */
export function SelectedLayoutName({
  layout,
  titleEdit,
}: {
  readonly layout: Layout;
  readonly titleEdit?: SpaceChromeTitleEdit;
}) {
  const layoutId = layout.id;
  const sameEdit = editing(titleEdit, 'layout', layoutId);
  const isEditing = sameEdit && titleEdit?.surface === 'header';
  const shownTitle = sameEdit ? (titleEdit?.draft ?? layout.title) : layout.title;
  return (
    // `data-continuation-control` is how a rename begun here gets the caret
    // back: the header is not a row and has no entity id of its own to be found
    // by, and `tabIndex={-1}` is what makes this box the thing focus lands on.
    <div
      data-testid="selected-canvas"
      data-continuation-control="layout-header"
      className="flex min-w-0"
      tabIndex={-1}
    >
      {isEditing ? (
        <InlineTitleEditor
          title={layout.title}
          label="Layout name"
          variant="header"
          draft={titleEdit.draft}
          error={titleEdit.error}
          onDraftChange={titleEdit.onDraftChange}
          onErrorChange={titleEdit.onErrorChange}
          onComplete={(title) => titleEdit.onComplete({ kind: 'layout', id: layoutId }, title)}
          onCancel={titleEdit.onCancel}
          onReturnFocus={titleEdit.onReturnFocus}
        />
      ) : // Plain text unless this header is the surface that would begin the
      // Edit. `sameEdit` is the case worth naming: the draft is already live on
      // the Sidebar row, so the header is mirroring it — offering Edit here
      // would call `onBegin` a second time and reset the draft to the committed
      // title, discarding what the author has typed.
      titleEdit === undefined || titleEdit.disabled === true || sameEdit ? (
        // The same box as the Button below, taken from the Button's own
        // variants rather than restated, so changing edit state never changes
        // the header height or moves the canvas under the author.
        <span
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'compact' }),
            'cursor-default truncate hover:border-transparent hover:bg-transparent hover:text-muted-foreground',
          )}
        >
          {shownTitle}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="compact"
          aria-label={`Edit Layout ${shownTitle}`}
          onClick={() =>
            titleEdit.onBegin({ kind: 'layout', id: layoutId }, layout.title, 'header')
          }
        >
          {shownTitle}
        </Button>
      )}
    </div>
  );
}
