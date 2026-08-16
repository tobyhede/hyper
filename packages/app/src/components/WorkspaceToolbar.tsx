import type { ReactNode } from 'react';
import {
  AddCardControl,
  GraphSelector,
  LayoutSelector,
  ViewSelector,
  type AddCardControlProps,
  type GraphSelectorProps,
  type LayoutSelectorProps,
  type ViewSelectorProps,
} from '@project/ui';

export interface WorkspaceToolbarProps {
  readonly view: ViewSelectorProps;
  readonly layout: LayoutSelectorProps;
  readonly graph: GraphSelectorProps;
  readonly addCard: AddCardControlProps;
  readonly persistence: ReactNode;
  readonly persistenceState: string;
  readonly acknowledgedRevision: bigint;
}

/** The production ordering and composition of workspace-level controls. */
export function WorkspaceToolbar({
  view,
  layout,
  graph,
  addCard,
  persistence,
  persistenceState,
  acknowledgedRevision,
}: WorkspaceToolbarProps) {
  return (
    <>
      <ViewSelector {...view} />
      <LayoutSelector {...layout} />
      <GraphSelector {...graph} />
      <AddCardControl {...addCard} />
      {persistence}
      <span
        hidden
        aria-hidden="true"
        data-testid="persistence-status"
        data-persistence-state={persistenceState}
        data-revision={acknowledgedRevision.toString()}
      >
        {persistenceState === 'settled' ? 'Persisted' : persistenceState}
      </span>
    </>
  );
}
