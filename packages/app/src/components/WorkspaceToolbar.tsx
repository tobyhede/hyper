import type { ReactNode, Ref } from 'react';
import type { Graph, Layout } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  AddCardControl,
  Button,
  FALLBACK_GRAPH_COLOR,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarTrigger,
  PresentIcon,
} from '@project/ui';
import type { AlgorithmicViewId } from '@project/ui';

export interface WorkspaceToolbarProps {
  readonly view: {
    readonly value: AlgorithmicViewId;
    readonly active: boolean;
    readonly onValueChange: (view: AlgorithmicViewId) => void;
  };
  readonly layout: {
    readonly layouts: readonly Layout[];
    readonly value: string | null;
    readonly active: boolean;
    readonly onValueChange: (layoutId: string) => void;
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

const views = [
  { id: 'flow', title: 'Flow' },
  { id: 'grid', title: 'Grid' },
] as const;

/** The production ordering and composition of workspace-level controls. */
export function WorkspaceToolbar({
  view,
  layout,
  graph,
  addCard,
  persistence,
}: WorkspaceToolbarProps) {
  const activeGraph = graph.graphs.find((candidate) => candidate.id === graph.activeGraphId);
  const activeGraphColor =
    activeGraph === undefined
      ? FALLBACK_GRAPH_COLOR
      : (graph.colorByGraphId[activeGraph.id] ?? activeGraph.color ?? FALLBACK_GRAPH_COLOR);
  const presentDisabled =
    !graph.presenting && (activeGraph === undefined || activeGraph.edges.length === 0);

  return (
    <>
      <Menubar aria-label="Workspace commands" modal={false}>
        <MenubarMenu>
          <MenubarTrigger data-testid="view-selector">
            View · {views.find((candidate) => candidate.id === view.value)?.title ?? 'Flow'}
          </MenubarTrigger>
          <MenubarContent finalFocus>
            <MenubarRadioGroup
              value={view.active ? view.value : ''}
              onValueChange={(value) => view.onValueChange(value as AlgorithmicViewId)}
            >
              {views.map((candidate) => (
                <MenubarRadioItem key={candidate.id} value={candidate.id} closeOnClick>
                  {candidate.title}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger data-testid="layout-selector">
            {layout.active ? (
              <span
                data-testid="layout-live-indicator"
                className="mr-1 size-[6px] shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
            ) : null}
            Layout ·{' '}
            {view.active
              ? 'None'
              : (layout.layouts.find((item) => item.id === layout.value)?.title ?? 'None')}
          </MenubarTrigger>
          <MenubarContent finalFocus>
            <MenubarRadioGroup
              value={layout.active ? (layout.value ?? '') : ''}
              onValueChange={layout.onValueChange}
            >
              {layout.layouts.length === 0 ? (
                <MenubarItem disabled>No authored Layouts</MenubarItem>
              ) : (
                layout.layouts.map((item) => (
                  <MenubarRadioItem key={item.id} value={item.id} closeOnClick>
                    {item.title}
                  </MenubarRadioItem>
                ))
              )}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger data-testid="graph-selector">
            <span
              aria-hidden="true"
              className="mr-1 h-[3px] w-[14px] shrink-0 rounded-[2px]"
              style={{ background: activeGraphColor }}
            />
            Graph · {activeGraph?.title ?? 'None'}
          </MenubarTrigger>
          <MenubarContent finalFocus>
            <MenubarRadioGroup value={graph.activeGraphId ?? ''} onValueChange={graph.onActivate}>
              {graph.graphs.length === 0 ? (
                <MenubarItem disabled>No Graphs</MenubarItem>
              ) : (
                graph.graphs.map((item) => (
                  <MenubarRadioItem key={item.id} value={item.id} closeOnClick>
                    <span
                      aria-hidden="true"
                      className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                      style={{
                        background:
                          graph.colorByGraphId[item.id] ?? item.color ?? FALLBACK_GRAPH_COLOR,
                      }}
                    />
                    {item.title}
                  </MenubarRadioItem>
                ))
              )}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <Button
        variant="secondary"
        size="toolbar"
        data-testid={graph.presenting ? 'exit-presenting-button' : 'present-button'}
        aria-label={graph.presenting ? 'Return to overview' : 'Present this Graph'}
        disabled={presentDisabled}
        onClick={graph.presenting ? graph.onExitPresenting : graph.onPresent}
      >
        {graph.presenting ? null : (
          <PresentIcon data-icon="inline-start" color={activeGraphColor} />
        )}
        {graph.presenting ? 'Overview' : 'Present'}
      </Button>

      <AddCardControl {...addCard} />

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
    </>
  );
}
