import type { ReactNode, Ref } from 'react';
import type { BuiltInViewId, Graph, Layout } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  AddCardControl,
  Button,
  FALLBACK_GRAPH_COLOR,
  GraphSelector,
  graphColor,
  LayoutSelector,
  PresentIcon,
  ViewSelector,
} from '@project/ui';

export interface WorkspaceToolbarProps {
  readonly view: {
    readonly value: BuiltInViewId;
    readonly active: boolean;
    readonly onValueChange: (view: BuiltInViewId) => void;
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

/**
 * The production ordering and composition of workspace-level controls.
 *
 * View, Layout and Graph are three independent single choices, each showing its
 * current value, so each is a Select. They are deliberately not a Menubar: a
 * menubar trigger is a stable command noun, and roving focus across the bar
 * assumes stable command groups, neither of which describes a value picker.
 */
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
      : graphColor(activeGraph, graph.colorByGraphId);
  // Dead on two things, and they are one rule: there is no Card to begin at. No
  // Graph is active, or the active Graph holds no Edges — and the second is not
  // a defensive nicety. Creating a Layout creates its initial Active Graph empty
  // in the same Edit (ADR 0040), so a Layout converted out of a View by a plain
  // Card drag is always in this state until the author draws something.
  const presentDisabled =
    !graph.presenting && (activeGraph === undefined || activeGraph.edges.length === 0);

  return (
    <>
      <AddCardControl {...addCard} />

      <ViewSelector value={view.value} active={view.active} onValueChange={view.onValueChange} />
      <LayoutSelector
        layouts={layout.layouts}
        value={layout.value}
        active={layout.active}
        onValueChange={layout.onValueChange}
      />
      <GraphSelector
        graphs={graph.graphs}
        colorByGraphId={graph.colorByGraphId}
        activeGraphId={graph.activeGraphId}
        onActivate={graph.onActivate}
      />

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
