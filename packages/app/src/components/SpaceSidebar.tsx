import { useId, type ReactNode, type Ref } from 'react';
import {
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  type Graph,
  type GraphId,
  type PerComputedView,
  type UUID,
} from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  AddCardControl,
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  buttonVariants,
  cn,
  EntityActions,
  EntityActionsTrigger,
  FALLBACK_GRAPH_COLOR,
  FlowIcon,
  GraphIcon,
  graphColor,
  GridIcon,
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
import type { EntityActionGroup } from '@project/ui';
import type { CanvasRenderers, CanvasRenderer } from '../canvas-renderers';
import { describeAuthoringRefusal } from '../authoring-refusal';
import { canvasRendererKey, type CanvasRendererId } from '../renderer';
import type { AuthoringRefusal } from '../space-authoring';

export interface SpaceSidebarProps {
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
    /** The computed and authored rows `canvasRenderers` derives from the Space. */
    readonly renderers: CanvasRenderers;
    /**
     * The row that is drawing, which `currentRenderer` answers from that list.
     *
     * Matched to a row by `canvasRendererKey` and not by object identity. The
     * interface is structural, so "this came out of that list" is a thing a
     * hand-built literal can break and the compiler cannot check; making the
     * pressed test the one identity rule means it does not have to. A caller
     * that lists from one derivation and takes its current row from a second
     * presses the right row rather than none.
     */
    readonly current: CanvasRenderer;
    /**
     * Hands back the bare selection, which is what Navigation takes. The row's
     * title belongs to whoever built the list: a caller that has to name what is
     * drawing reads `current` rather than deriving a second title of its
     * own.
     */
    readonly onSelect: (selection: CanvasRendererId) => void;
  };
  readonly graph: {
    readonly graphs: readonly Graph[];
    readonly colorByGraphId: Readonly<Record<string, string>>;
    readonly activeGraphId: string | null;
    readonly onActivate: (graphId: GraphId) => void;
    readonly links?: {
      readonly onCopyCanonical: (graphId: GraphId) => void;
      readonly onCopyContextual: (graphId: GraphId) => void;
    };
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
    readonly disabled?: boolean;
    readonly keyShortcut?: string;
    readonly menuTriggerRef?: Ref<HTMLButtonElement>;
  };
  readonly createLayout?:
    | {
        readonly disabled: boolean;
        readonly unavailableReason: string | null;
        readonly refusal: AuthoringRefusal | null;
        readonly onCreate: () => void;
      }
    | undefined;
  readonly persistence: {
    readonly control: ReactNode;
    readonly state: SpaceSessionState['persistence']['kind'];
    readonly acknowledgedRevision: bigint;
  };
  readonly cardLinks?:
    | {
        readonly title: string;
        readonly onCopyCanonical: () => void;
        /**
         * Absent when the Card has no address in the current Space View — a
         * Card the selected Layout omits and the Cards drawer reveals. The
         * command is withheld rather than shown and refused, because the
         * destination it would copy does not exist.
         */
        readonly onCopyContextual?: (() => void) | undefined;
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
 * An entity this Sidebar draws a row for, named the way the row knows it.
 *
 * It carries the whole `CanvasRenderer`/`Graph` rather than an id, for the
 * reason `SelectedCanvasRenderer` takes the row: handed an id, a caller has to
 * find the thing again down a second path, and the Sidebar and the menu on its
 * own row are then free to disagree about what they are naming.
 */
export type SpaceEntity =
  | { readonly kind: 'space' }
  | { readonly kind: 'space-view'; readonly renderer: CanvasRenderer }
  | { readonly kind: 'graph'; readonly graph: Graph; readonly renderer: CanvasRenderer };

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
    returnFocus: () => void,
  ) => void;
  readonly onDraftChange: (draft: string) => void;
  readonly onErrorChange: (error: string | null) => void;
  readonly onComplete: (subject: SpaceChromeTitleSubject, title: string) => string | null;
  readonly onCancel: () => void;
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

/**
 * One glyph per Computed View, beside the id it draws.
 *
 * `PerComputedView` is what makes a new Computed View visible here: the tuple
 * holds one entry per id `core` ships, so a third View fails to compile until it
 * has a glyph. That is the guarantee `satisfies Record<BuiltInViewId, …>` gave
 * while a View was identified by a string literal, and its absence is silent —
 * a missing glyph is not a blank row but the authored-Layout glyph, drawn for
 * something that is not a Layout.
 *
 * The glyphs stay here rather than moving beside the View's strategy and title:
 * exactly one module draws a row today, so a glyph declared next to the strategy
 * would open a seam nothing crosses — and it would make a pure module import
 * `@project/ui`. Revisit when a second module draws a row.
 */
const COMPUTED_VIEW_ICONS: PerComputedView<readonly [UUID, ReactNode]> = [
  [FLOW_SPACE_VIEW_ID, <FlowIcon key={FLOW_SPACE_VIEW_ID} />],
  [GRID_SPACE_VIEW_ID, <GridIcon key={GRID_SPACE_VIEW_ID} />],
];

const VIEW_ICONS = new Map<UUID, ReactNode>(COMPUTED_VIEW_ICONS);

/**
 * A row's glyph, chosen on the kind the row already carries rather than on
 * whether a lookup missed (ADR 0072 leaves the kind to resolution, and
 * `canvasRenderers` has already resolved it).
 *
 * An authored Layout draws one glyph whatever its id; a Computed View draws the
 * one paired with it above. The tuple covers every id `core` ships, so a View
 * with no glyph cannot compile and the absent arm here cannot be reached.
 */
const RendererIcon = ({ renderer }: { readonly renderer: CanvasRenderer }): ReactNode =>
  renderer.kind === 'authored' ? <LayoutIcon /> : VIEW_ICONS.get(renderer.selection);

/**
 * One group of the single canvas choice.
 *
 * Named for the group it draws and not for what it draws — `CanvasRenderers` is
 * the aggregate this takes one list *out of*, and one identifier meaning both
 * is what ADR 0055 is about. It compiles today only because that import is
 * type-only, so the two names sit in different declaration spaces; dropping the
 * `type` or adding a value export under that name turns it into TS2440.
 *
 * Computed Views and authored Layouts are drawn as two groups of one list and
 * not as two controls: exactly one item across both is pressed, and there is no
 * value anywhere meaning "the other group is the one drawing" (ADR 0053).
 *
 * The pressed test is `canvasRendererKey` against the row the choice already
 * named, so both groups are asked the same question by the same value — and it
 * is the same question the row keys and `data-renderer` are already written in.
 * It cannot answer twice: a key names one selection, and a Space cannot hold
 * two renderers with one id.
 */
function RendererGroup({
  renderers,
  selected,
  onSelect,
  titleEdit,
  entityActions,
}: {
  readonly renderers: readonly CanvasRenderer[];
  readonly selected: CanvasRenderer;
  readonly onSelect: (selection: CanvasRendererId) => void;
  readonly titleEdit: SpaceChromeTitleEdit | undefined;
  readonly entityActions: SpaceSidebarProps['entityActions'];
}) {
  const selectedKey = canvasRendererKey(selected.selection);
  return (
    <SidebarMenu>
      {renderers.map((renderer) => {
        const active = canvasRendererKey(renderer.selection) === selectedKey;
        const layoutId = renderer.kind === 'authored' ? renderer.selection : null;
        const isEditing =
          layoutId !== null &&
          editing(titleEdit, 'layout', layoutId) &&
          titleEdit?.surface === 'sidebar';
        const shownTitle =
          layoutId !== null && editing(titleEdit, 'layout', layoutId)
            ? (titleEdit?.draft ?? renderer.title)
            : renderer.title;
        return (
          <SidebarMenuItem key={canvasRendererKey(renderer.selection)} tabIndex={-1}>
            <EntityActionsRow
              entity={{ kind: 'space-view', renderer }}
              entityActions={entityActions}
              label={`Actions for Space View ${renderer.title}`}
              editing={isEditing}
            >
              {isEditing ? (
                // The row keeps its addressing hooks while its own rename is
                // live: an open pane marks the root `inert`, so `data-renderer`
                // is how a covered Sidebar is reached at all (docs/agents/ui.md).
                // `aria-pressed` is not carried across — this branch renders a
                // `div`, and pressed state on a non-button is not a thing to say.
                <SidebarMenuButton
                  render={<div />}
                  isActive={active}
                  data-testid="canvas-renderer"
                  data-renderer={canvasRendererKey(renderer.selection)}
                >
                  <RendererIcon renderer={renderer} />
                  <InlineTitleEditor
                    className="flex-1"
                    title={renderer.title}
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
                  data-testid="canvas-renderer"
                  data-renderer={canvasRendererKey(renderer.selection)}
                  onClick={(event) => {
                    if (
                      active &&
                      layoutId !== null &&
                      titleEdit !== undefined &&
                      titleEdit.disabled !== true
                    ) {
                      const row = event.currentTarget.closest('li');
                      titleEdit.onBegin(
                        { kind: 'layout', id: layoutId },
                        renderer.title,
                        'sidebar',
                        () => row?.focus(),
                      );
                    } else {
                      onSelect(renderer.selection);
                    }
                  }}
                >
                  <RendererIcon renderer={renderer} />
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
  spaceTitle,
  canvas,
  graph,
  addCard,
  createLayout,
  persistence,
  cardLinks,
  entityActions,
  titleEdit,
  collapsible = 'offcanvas',
  className,
}: SpaceSidebarProps) {
  // Below the primitive's breakpoint this whole surface is a modal Sheet drawn
  // *over* the canvas, with a focus trap and everything behind it inert. Every
  // command here acts on the canvas, so every one of them dismisses the sheet
  // first: Add Card and Add Alias open an editor that otherwise cannot take
  // focus at all, and the rest would leave the author looking at the sidebar
  // instead of the result. Above the breakpoint the sidebar is beside the canvas
  // and there is nothing to dismiss.
  const { isMobile, setOpenMobile } = useSidebar();
  const createLayoutReasonId = useId();
  const computedViewReadOnlyId = useId();
  const onCanvas =
    <Args extends readonly unknown[]>(command: (...args: Args) => void) =>
    (...args: Args): void => {
      if (isMobile) setOpenMobile(false);
      command(...args);
    };

  const activeGraph = graph.graphs.find((candidate) => candidate.id === graph.activeGraphId);
  const activeGraphColor =
    activeGraph === undefined
      ? FALLBACK_GRAPH_COLOR
      : graphColor(activeGraph, graph.colorByGraphId);
  // Dead on two things, and they are one rule: there is no Card to begin at. No
  // Graph is active, or the active Graph holds no Edges — and the second is not
  // a defensive nicety. Creating a Layout creates its initial Active Graph empty
  // in the same Edit (ADR 0040), so a Layout converted out of a View by a plain
  // explicit Create Layout Edit is always in this state until the author draws something.
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
            entityActions={entityActions}
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
        {createLayout === undefined ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <AddCardControl
                {...addCard}
                onAddCard={onCanvas(addCard.onAddCard)}
                onAddAlias={onCanvas(addCard.onAddAlias)}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Space View</SidebarGroupLabel>
          <SidebarGroupContent>
            <RendererGroup
              renderers={canvas.renderers.computed}
              selected={canvas.current}
              onSelect={onCanvas(canvas.onSelect)}
              titleEdit={titleEdit}
              entityActions={entityActions}
            />
            {canvas.renderers.authored.length === 0 ? (
              <NothingYet testId="no-authored-layouts">
                None yet — create one from the selected Computed View.
              </NothingYet>
            ) : (
              <RendererGroup
                renderers={canvas.renderers.authored}
                selected={canvas.current}
                onSelect={onCanvas(canvas.onSelect)}
                titleEdit={titleEdit}
                entityActions={entityActions}
              />
            )}
            {createLayout === undefined ? null : (
              <div className="mt-2 space-y-2">
                <Button
                  variant="secondary"
                  size="compact"
                  className="w-full justify-start gap-2"
                  disabled={createLayout.disabled}
                  aria-describedby={`${computedViewReadOnlyId}${
                    createLayout.disabled && createLayout.unavailableReason !== null
                      ? ` ${createLayoutReasonId}`
                      : ''
                  }`}
                  onClick={onCanvas(createLayout.onCreate)}
                >
                  <LayoutIcon />
                  Create Layout
                </Button>
                <p id={computedViewReadOnlyId} className="text-xs text-muted-foreground">
                  Computed Views are read-only. Create a Layout to edit.
                </p>
                {createLayout.disabled && createLayout.unavailableReason !== null ? (
                  <p id={createLayoutReasonId} className="text-xs text-muted-foreground">
                    {createLayout.unavailableReason}
                  </p>
                ) : null}
                {createLayout.refusal === null ? null : (
                  <Alert variant="destructive">
                    <AlertIcon />
                    <AlertTitle>Layout not created</AlertTitle>
                    <AlertDescription>
                      {describeAuthoringRefusal(createLayout.refusal)}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
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
                        entity={{ kind: 'graph', graph: candidate, renderer: canvas.current }}
                        entityActions={entityActions}
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
                            onClick={(event) => {
                              if (
                                active &&
                                titleEdit !== undefined &&
                                titleEdit.disabled !== true
                              ) {
                                const row = event.currentTarget.closest('li');
                                titleEdit.onBegin(
                                  { kind: 'graph', id: candidate.id },
                                  candidate.title,
                                  'sidebar',
                                  () => row?.focus(),
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
            {graph.links !== undefined && activeGraph !== undefined && (
              <div className="grid gap-1 pt-1">
                <Button
                  variant="secondary"
                  size="compact"
                  className="w-full justify-start"
                  onClick={onCanvas(() => graph.links?.onCopyCanonical(activeGraph.id))}
                >
                  Copy link to {activeGraph.title}
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  className="w-full justify-start"
                  onClick={onCanvas(() => graph.links?.onCopyContextual(activeGraph.id))}
                >
                  Copy link to {activeGraph.title} in this Space View
                </Button>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="nokey">
        {cardLinks !== undefined && (
          <div className="grid gap-1">
            <Button
              variant="secondary"
              size="compact"
              onClick={onCanvas(cardLinks.onCopyCanonical)}
            >
              Copy link to {cardLinks.title}
            </Button>
            {cardLinks.onCopyContextual !== undefined && (
              <Button
                variant="secondary"
                size="compact"
                onClick={onCanvas(cardLinks.onCopyContextual)}
              >
                Copy link in this Space View
              </Button>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * What the canvas header says: the name of the one thing drawing, and whether
 * an author placed it or the application computed it.
 *
 * Separate from the sidebar it reports on, because it sits in the inset and
 * survives the sidebar closing — the single choice is still named when the list
 * it was made in is off screen.
 *
 * It takes the **row**, never a bare title and kind. Handed those two, a caller
 * can name what is drawing down a second path — off the resolved renderer, say —
 * and the header and the list it reports on are free to disagree again. Taking
 * the row means the only way to draw this is to have built the list.
 */
export function SelectedCanvasRenderer({
  renderer,
  titleEdit,
}: {
  readonly renderer: CanvasRenderer;
  readonly titleEdit?: SpaceChromeTitleEdit;
}) {
  const layoutId = renderer.kind === 'authored' ? renderer.selection : null;
  const sameEdit = layoutId !== null && editing(titleEdit, 'layout', layoutId);
  const isEditing = sameEdit && titleEdit?.surface === 'header';
  const shownTitle = sameEdit ? (titleEdit?.draft ?? renderer.title) : renderer.title;
  return (
    <div data-testid="selected-canvas" className="flex min-w-0" tabIndex={-1}>
      {isEditing ? (
        <InlineTitleEditor
          title={renderer.title}
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
      layoutId === null || titleEdit === undefined || titleEdit.disabled === true || sameEdit ? (
        // The same box as the Button below, taken from the Button's own
        // variants rather than restated: the two branches swap as the canvas
        // choice moves between a computed View and a Layout, and a header that
        // changes height on that swap moves the whole canvas under the author.
        // Only the interactive affordances are dropped — this names the Space
        // View, it does not offer anything.
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
          aria-label={`Edit Space View ${shownTitle}`}
          onClick={(event) => {
            const header = event.currentTarget.parentElement;
            titleEdit.onBegin({ kind: 'layout', id: layoutId }, renderer.title, 'header', () =>
              header?.focus(),
            );
          }}
        >
          {shownTitle}
        </Button>
      )}
    </div>
  );
}
