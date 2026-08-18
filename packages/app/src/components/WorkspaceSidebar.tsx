import type { ReactNode, Ref } from 'react';
import type { BuiltInViewId, Graph } from '@project/core';
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
import { rendererSelectionKey, type RendererSelection } from '../renderer';

/**
 * One thing the canvas can be drawing, named for the list it appears in.
 *
 * It carries the `RendererSelection` itself rather than an id and a kind, so
 * choosing an item hands back exactly what Navigation takes and nothing has to
 * be reassembled — or narrowed with a cast — on the way.
 */
export interface CanvasChoice {
  readonly selection: RendererSelection;
  readonly title: string;
}

export interface WorkspaceSidebarProps {
  /** The Space's title. The canvas header names what is drawing it (ADR 0053). */
  readonly workspaceTitle: string;
  readonly canvas: {
    readonly computed: readonly CanvasChoice[];
    readonly authored: readonly CanvasChoice[];
    readonly selected: RendererSelection;
    /**
     * Hands back the chosen row whole rather than the selection inside it, so a
     * caller that has to name what it chose — a canvas header, a fixture — has
     * the title without looking the row up again by identity.
     */
    readonly onSelect: (choice: CanvasChoice) => void;
  };
  readonly graph: {
    readonly graphs: readonly Graph[];
    readonly colorByGraphId: Readonly<Record<string, string>>;
    readonly activeGraphId: string | null;
    readonly onActivate: (graphId: string) => void;
    readonly onPresent: () => void;
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
}

/**
 * Keyed by the ids `core` ships, so a new built-in View is a compile error here
 * rather than a View the workspace quietly draws without a glyph.
 */
const VIEW_ICONS = {
  flow: FlowIcon,
  grid: GridIcon,
} as const satisfies Record<BuiltInViewId, () => ReactNode>;

const sameChoice = (left: RendererSelection, right: RendererSelection): boolean =>
  rendererSelectionKey(left) === rendererSelectionKey(right);

const ChoiceIcon = ({ selection }: { readonly selection: RendererSelection }): ReactNode => {
  if (selection.kind === 'layout') return <LayoutIcon />;
  const Icon = VIEW_ICONS[selection.view];
  return <Icon />;
};

/**
 * One group of the single canvas choice.
 *
 * Computed Views and authored Layouts are drawn as two groups of one list and
 * not as two controls: exactly one item across both is pressed, and there is no
 * value anywhere meaning "the other group is the one drawing" (ADR 0053).
 */
function CanvasChoices({
  choices,
  selected,
  onSelect,
}: {
  readonly choices: readonly CanvasChoice[];
  readonly selected: RendererSelection;
  readonly onSelect: (choice: CanvasChoice) => void;
}) {
  return (
    <SidebarMenu>
      {choices.map((choice) => {
        const active = sameChoice(choice.selection, selected);
        return (
          <SidebarMenuItem key={rendererSelectionKey(choice.selection)}>
            <SidebarMenuButton
              isActive={active}
              aria-pressed={active}
              data-testid="canvas-choice"
              data-choice={rendererSelectionKey(choice.selection)}
              onClick={() => onSelect(choice)}
            >
              <ChoiceIcon selection={choice.selection} />
              <span>{choice.title}</span>
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
 * The workspace's command surface (ADR 0053).
 *
 * Everything persistent lives here: what draws the canvas, which Graph is
 * active, Card creation, presenting, and how saving is going. The canvas header
 * carries only the trigger that reopens this and the name of what is drawing.
 */
export function WorkspaceSidebar({
  workspaceTitle,
  canvas,
  graph,
  addCard,
  persistence,
}: WorkspaceSidebarProps) {
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
    !graph.presenting && (activeGraph === undefined || activeGraph.edges.length === 0);

  return (
    <Sidebar collapsible="offcanvas" data-testid="workspace-sidebar">
      <SidebarHeader>
        <h1 data-testid="workspace-title" className="truncate px-2 text-sm font-semibold">
          {workspaceTitle}
        </h1>
      </SidebarHeader>
      <SidebarSeparator />
      {/* `nokey` on both control-bearing regions rather than on the root: React
          Flow subscribes its delete key on `document` and excludes a target only
          by tag or by a `.nokey` ancestor, and the mobile Sheet renders these
          same regions through a portal where a class on the root would not be an
          ancestor at all. Without it, Delete with focus on a canvas choice
          removes the selected Edge. */}
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
            <CanvasChoices
              choices={canvas.computed}
              selected={canvas.selected}
              onSelect={onCanvas(canvas.onSelect)}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Authored layouts</SidebarGroupLabel>
          <SidebarGroupContent>
            {canvas.authored.length === 0 ? (
              <NothingYet testId="no-authored-layouts">
                None yet — editing a view creates one.
              </NothingYet>
            ) : (
              <CanvasChoices
                choices={canvas.authored}
                selected={canvas.selected}
                onSelect={onCanvas(canvas.onSelect)}
              />
            )}
          </SidebarGroupContent>
        </SidebarGroup>

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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="nokey">
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
 */
export function CurrentCanvas({
  title,
  kind,
}: {
  readonly title: string;
  readonly kind: RendererSelection['kind'];
}) {
  return (
    <div data-testid="current-canvas" className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-sm font-medium">{title}</span>
      <span
        data-testid="current-canvas-kind"
        className="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
      >
        {kind === 'layout' ? 'Authored layout' : 'Computed view'}
      </span>
    </div>
  );
}
