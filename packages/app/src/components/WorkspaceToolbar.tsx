import { useState, type Ref } from 'react';
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
  PersistenceIndicator,
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
  readonly persistence: SpaceSessionState['persistence'];
  readonly acknowledgedRevision: bigint;
  readonly onRetryPersistence: () => void;
  readonly onAcceptRemote: () => void;
  readonly onKeepLocal: () => void;
  readonly remoteRefusal?: string | null;
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
  acknowledgedRevision,
  onRetryPersistence,
  onAcceptRemote,
  onKeepLocal,
  remoteRefusal = null,
}: WorkspaceToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'view' | 'layout' | 'graph' | null>(null);
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
        <MenubarMenu
          open={openMenu === 'view'}
          onOpenChange={(open) => setOpenMenu(open ? 'view' : null)}
        >
          <MenubarTrigger data-testid="view-selector">
            View · {views.find((candidate) => candidate.id === view.value)?.title ?? 'Flow'}
          </MenubarTrigger>
          <MenubarContent>
            <MenubarRadioGroup value={view.active ? view.value : ''}>
              {views.map((candidate) => (
                <MenubarRadioItem
                  key={candidate.id}
                  value={candidate.id}
                  onClick={() => {
                    setOpenMenu(null);
                    view.onValueChange(candidate.id);
                  }}
                >
                  {candidate.title}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu
          open={openMenu === 'layout'}
          onOpenChange={(open) => setOpenMenu(open ? 'layout' : null)}
        >
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
          <MenubarContent>
            <MenubarRadioGroup value={layout.active ? (layout.value ?? '') : ''}>
              {layout.layouts.length === 0 ? (
                <MenubarItem disabled>No authored Layouts</MenubarItem>
              ) : (
                layout.layouts.map((item) => (
                  <MenubarRadioItem
                    key={item.id}
                    value={item.id}
                    onClick={() => {
                      setOpenMenu(null);
                      layout.onValueChange(item.id);
                    }}
                  >
                    {item.title}
                  </MenubarRadioItem>
                ))
              )}
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu
          open={openMenu === 'graph'}
          onOpenChange={(open) => setOpenMenu(open ? 'graph' : null)}
        >
          <MenubarTrigger data-testid="graph-selector">
            <span
              aria-hidden="true"
              className="mr-1 h-[3px] w-[14px] shrink-0 rounded-[2px]"
              style={{ background: activeGraphColor }}
            />
            Graph · {activeGraph?.title ?? 'None'}
          </MenubarTrigger>
          <MenubarContent>
            <MenubarRadioGroup value={graph.activeGraphId ?? ''}>
              {graph.graphs.length === 0 ? (
                <MenubarItem disabled>No Graphs</MenubarItem>
              ) : (
                graph.graphs.map((item) => (
                  <MenubarRadioItem
                    key={item.id}
                    value={item.id}
                    onClick={() => {
                      setOpenMenu(null);
                      graph.onActivate(item.id);
                    }}
                  >
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
        {graph.presenting ? null : <PresentIcon color={activeGraphColor} />}
        {graph.presenting ? 'Overview' : 'Present'}
      </Button>

      <AddCardControl {...addCard} />

      {persistence.kind === 'failed' ? (
        <Button
          variant="default"
          data-testid="persistence-retry"
          onClick={onRetryPersistence}
          title={persistence.failure.message}
        >
          Retry persistence
        </Button>
      ) : persistence.kind === 'conflicted' ? (
        <>
          <Button
            variant="default"
            data-testid="persistence-accept-remote"
            onClick={onAcceptRemote}
          >
            Accept remote
          </Button>
          <Button variant="default" data-testid="persistence-keep-local" onClick={onKeepLocal}>
            Keep local
          </Button>
          {remoteRefusal === null ? null : (
            <span
              role="alert"
              data-testid="persistence-remote-refused"
              className="persistence-refusal"
            >
              {remoteRefusal}
            </span>
          )}
        </>
      ) : (
        <PersistenceIndicator state={persistence.kind} />
      )}
      <span
        hidden
        aria-hidden="true"
        data-testid="persistence-status"
        data-persistence-state={persistence.kind}
        data-revision={acknowledgedRevision.toString()}
      >
        {persistence.kind === 'settled' ? 'Persisted' : persistence.kind}
      </span>
    </>
  );
}
