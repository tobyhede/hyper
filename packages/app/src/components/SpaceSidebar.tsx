import type { ReactNode, Ref } from 'react';
import {
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  type CardId,
  type Graph,
  type GraphId,
  type PerComputedView,
  type UUID,
} from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  AddCardControl,
  Button,
  FALLBACK_GRAPH_COLOR,
  FlowIcon,
  GraphIcon,
  graphColor,
  GridIcon,
  LayoutIcon,
  PresentIcon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@project/ui';
import type { CanvasRenderers, CanvasRenderer } from '../canvas-renderers';
import { canvasRendererKey, type CanvasRendererId } from '../renderer';

export interface SpaceSidebarProps {
  /** The Space's title. The canvas header names what is drawing it (ADR 0053). */
  readonly spaceTitle: string;
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
  readonly persistence: {
    readonly control: ReactNode;
    readonly state: SpaceSessionState['persistence']['kind'];
    readonly acknowledgedRevision: bigint;
  };
  readonly cardsCollection?:
    | {
        readonly cards: readonly { readonly id: CardId; readonly title: string }[];
        readonly revealedCardId: CardId | null;
      }
    | undefined;
  readonly cardLinks?:
    | {
        readonly title: string;
        readonly onCopyCanonical: () => void;
        /**
         * Absent when the Card has no address in the current Space View — a
         * Card the selected Layout omits and the Cards collection reveals. The
         * command is withheld rather than shown and refused, because the
         * destination it would copy does not exist.
         */
        readonly onCopyContextual?: (() => void) | undefined;
      }
    | undefined;
}

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
}: {
  readonly renderers: readonly CanvasRenderer[];
  readonly selected: CanvasRenderer;
  readonly onSelect: (selection: CanvasRendererId) => void;
}) {
  const selectedKey = canvasRendererKey(selected.selection);
  return (
    <SidebarMenu>
      {renderers.map((renderer) => {
        const active = canvasRendererKey(renderer.selection) === selectedKey;
        return (
          <SidebarMenuItem key={canvasRendererKey(renderer.selection)}>
            <SidebarMenuButton
              isActive={active}
              aria-pressed={active}
              data-testid="canvas-renderer"
              data-renderer={canvasRendererKey(renderer.selection)}
              onClick={() => onSelect(renderer.selection)}
            >
              <RendererIcon renderer={renderer} />
              <span>{renderer.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
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
  persistence,
  cardsCollection,
  cardLinks,
}: SpaceSidebarProps) {
  // Below the primitive's breakpoint this whole surface is a modal Sheet drawn
  // *over* the canvas, with a focus trap and everything behind it inert. Every
  // command here acts on the canvas, so every one of them dismisses the sheet
  // first: Add Card and Add Alias open an editor that otherwise cannot take
  // focus at all, and the rest would leave the author looking at the sidebar
  // instead of the result. Above the breakpoint the sidebar is beside the canvas
  // and there is nothing to dismiss.
  const { isMobile, setOpenMobile } = useSidebar();
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
  // Card drag is always in this state until the author draws something.
  const presentDisabled =
    !graph.presenting &&
    (graph.canPresent === false || activeGraph === undefined || activeGraph.edges.length === 0);

  return (
    <Sidebar collapsible="offcanvas" data-testid="space-sidebar">
      <SidebarHeader>
        <h1 data-testid="space-title" className="truncate px-2 text-sm font-semibold">
          {spaceTitle}
        </h1>
      </SidebarHeader>
      <SidebarSeparator />
      {/* `nokey` sits on both control-bearing regions rather than on the root.
          React Flow's live Space-key pan activation subscription reads it, and
          the mobile Sheet portals these regions somewhere a class on the root
          would not be an ancestor at all. */}
      <SidebarContent className="nokey">
        <SidebarGroup>
          <SidebarGroupContent>
            <AddCardControl
              {...addCard}
              onAddCard={onCanvas(addCard.onAddCard)}
              onAddAlias={onCanvas(addCard.onAddAlias)}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Computed views</SidebarGroupLabel>
          <SidebarGroupContent>
            <RendererGroup
              renderers={canvas.renderers.computed}
              selected={canvas.current}
              onSelect={onCanvas(canvas.onSelect)}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Authored layouts</SidebarGroupLabel>
          <SidebarGroupContent>
            {canvas.renderers.authored.length === 0 ? (
              <NothingYet testId="no-authored-layouts">
                None yet — editing a view creates one.
              </NothingYet>
            ) : (
              <RendererGroup
                renderers={canvas.renderers.authored}
                selected={canvas.current}
                onSelect={onCanvas(canvas.onSelect)}
              />
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {cardsCollection !== undefined && (
          <SidebarGroup>
            <SidebarGroupLabel>Cards</SidebarGroupLabel>
            <SidebarGroupContent>
              {cardsCollection.cards.length === 0 ? (
                <NothingYet testId="no-cards-outside-layout">
                  All Cards are in this Layout.
                </NothingYet>
              ) : (
                <SidebarMenu>
                  {cardsCollection.cards.map((card) => {
                    const revealed = card.id === cardsCollection.revealedCardId;
                    return (
                      <SidebarMenuItem key={card.id}>
                        <SidebarMenuButton
                          render={<span />}
                          isActive={revealed}
                          aria-current={revealed ? 'true' : undefined}
                          data-card-id={card.id}
                        >
                          <span>{card.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Graphs</SidebarGroupLabel>
          <SidebarGroupContent>
            {graph.graphs.length === 0 ? (
              <NothingYet testId="no-graphs">None yet — the first Layout mints one.</NothingYet>
            ) : (
              <SidebarMenu>
                {graph.graphs.map((candidate) => {
                  const active = candidate.id === graph.activeGraphId;
                  return (
                    <SidebarMenuItem key={candidate.id}>
                      <SidebarMenuButton
                        isActive={active}
                        aria-pressed={active}
                        data-testid="graph-choice"
                        data-graph-id={candidate.id}
                        onClick={onCanvas(() => graph.onActivate(candidate.id))}
                      >
                        <GraphIcon color={graphColor(candidate, graph.colorByGraphId)} />
                        <span>{candidate.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
            {graph.links !== undefined && activeGraph !== undefined && (
              <div className="grid gap-1 pt-1">
                <Button
                  variant="secondary"
                  size="toolbar"
                  className="w-full justify-start"
                  onClick={onCanvas(() => graph.links?.onCopyCanonical(activeGraph.id))}
                >
                  Copy link to {activeGraph.title}
                </Button>
                <Button
                  variant="secondary"
                  size="toolbar"
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
              size="toolbar"
              onClick={onCanvas(cardLinks.onCopyCanonical)}
            >
              Copy link to {cardLinks.title}
            </Button>
            {cardLinks.onCopyContextual !== undefined && (
              <Button
                variant="secondary"
                size="toolbar"
                onClick={onCanvas(cardLinks.onCopyContextual)}
              >
                Copy link in this Space View
              </Button>
            )}
          </div>
        )}
        <Button
          variant="secondary"
          size="toolbar"
          className="w-full justify-start gap-2"
          data-testid={graph.presenting ? 'exit-presenting-button' : 'present-button'}
          disabled={presentDisabled}
          onClick={onCanvas(graph.presenting ? graph.onExitPresenting : graph.onPresent)}
        >
          {graph.presenting ? null : <PresentIcon color={activeGraphColor} />}
          {/* The visible text is the accessible name. It carries the active
              Graph because the button acts on that Graph and on no other, and
              an `aria-label` naming something else would leave voice control
              unable to speak what is on the button. */}
          {graph.presenting
            ? 'Overview'
            : activeGraph === undefined
              ? 'Present'
              : `Present ${activeGraph.title}`}
        </Button>
        <div className="flex items-center justify-end px-1">
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
export function SelectedCanvasRenderer({ renderer }: { readonly renderer: CanvasRenderer }) {
  return (
    <div data-testid="selected-canvas" className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-sm font-medium">{renderer.title}</span>
      <span
        data-testid="selected-canvas-kind"
        className="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
      >
        {renderer.kind === 'authored' ? 'Authored layout' : 'Computed view'}
      </span>
    </div>
  );
}
