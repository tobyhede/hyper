import { useRef, useState } from 'react';
import {
  AddCardControl,
  Button,
  GraphSelector,
  LayoutSelector,
  ViewSelector,
  type AlgorithmicViewId,
} from '@project/ui';
import { colorByGraphId, graphIds, graphs, layoutId, layouts } from './fixture';

/**
 * The toolbar, composed from the components the product composes it from —
 * `ViewSelector`, `LayoutSelector`, `GraphSelector`, `AddCardControl` and the
 * persistence indicator, in that order, which is `App.tsx`'s order.
 *
 * It lives outside `shell.stories.tsx` on purpose. **Ladle turns every export of
 * a story module into a story**, so while this was exported from there it was
 * rendered as one — into Ladle's plain story container, which is not a flex
 * box. The controls are `inline-flex`, so they baseline-aligned instead of
 * centring, and a flex container's baseline is its *first item's*: the Layout
 * selector leads with a 6px dot and dropped some five pixels below its
 * neighbours, which read as a staircase and as a toolbar bug it is not. Every
 * story below draws it inside `.shell__header`, which is what the app does.
 *
 * The selectors keep local state so their menus can be opened and looked at.
 * Nothing is submitted anywhere: choosing a Layout here changes a `useState`
 * and no Space exists behind it.
 */

export type Persistence = 'persisted' | 'pending' | 'rejected' | 'failed' | 'conflicted';

const PersistenceIndicator = ({ kind }: { kind: Persistence }) => {
  if (kind === 'failed') {
    return (
      <Button variant="default" size="toolbar" title="Commit rejected — retryable">
        Retry persistence
      </Button>
    );
  }
  if (kind === 'conflicted') {
    return (
      <>
        <Button variant="default" size="toolbar">
          Accept remote
        </Button>
        <Button variant="default" size="toolbar">
          Keep local
        </Button>
      </>
    );
  }
  return (
    <span title="Database persistence status">
      {kind === 'pending'
        ? 'Persisting…'
        : kind === 'rejected'
          ? 'Persistence rejected'
          : 'Persisted'}
    </span>
  );
};

export interface ToolbarProps {
  readonly persistence?: Persistence;
  readonly presenting?: boolean;
  readonly authoringDisabled?: boolean;
}

export const Toolbar = ({
  persistence = 'persisted',
  presenting = false,
  authoringDisabled = false,
}: ToolbarProps) => {
  const [view, setView] = useState<AlgorithmicViewId>('flow');
  const [layout, setLayout] = useState<string | null>(layoutId);
  const [activeGraph, setActiveGraph] = useState<string | null>(graphIds.long);
  const addCardMenu = useRef<HTMLButtonElement>(null);

  return (
    <>
      <ViewSelector value={view} active={layout === null} onValueChange={setView} />
      <LayoutSelector
        layouts={layouts}
        value={layout}
        active={layout !== null}
        onValueChange={setLayout}
      />
      <GraphSelector
        graphs={graphs}
        activeGraphId={activeGraph}
        colorByGraphId={colorByGraphId}
        onActivate={setActiveGraph}
        onPresent={() => undefined}
        presenting={presenting}
        onExitPresenting={() => undefined}
      />
      <AddCardControl
        onAddCard={() => undefined}
        onAddAlias={() => undefined}
        disabled={authoringDisabled}
        keyShortcut="C"
        menuTriggerRef={addCardMenu}
      />
      <PersistenceIndicator kind={persistence} />
    </>
  );
};
