import { useCallback, useMemo, useRef, useState } from 'react';
import type { Space } from '@project/graph';
import { AppShell } from '@project/ui';
import { resolveLayout } from '#src/layout-resolution';
import { graphColorMap } from '#src/colors';
import { PersistenceControl } from '#components/PersistenceControl';
import { OpenSpaceSidebars, type OpenSpaceSidebar } from '#components/OpenSpaceSidebars';
import { SelectedLayoutName, type SpaceSidebarProps } from '#components/SpaceSidebar';
import { useStoryNavigation } from './navigation';
import { authoredSpace, deepDiveSpace, traversalSpace } from './spaces';

function useOpenSpace(space: Space, status?: OpenSpaceSidebar['status']) {
  const readSpace = useCallback(() => space, [space]);
  const { navigation, state } = useStoryNavigation(readSpace);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  const resolved = useMemo(
    () => resolveLayout(space, state.selectedLayoutId),
    [space, state.selectedLayoutId],
  );
  const sidebar: SpaceSidebarProps = {
    spaceTitle: space.title,
    canvas: {
      layouts: space.layouts,
      selected: resolved.layout,
      onSelect: navigation.selectLayout,
    },
    graph: {
      graphs: resolved.layout.graphs,
      activeGraphId: state.activeGraphId,
      colorByGraphId: graphColorMap(space),
      onActivate: navigation.activateGraph,
      onPresent: navigation.present,
      presenting: state.mode === 'presenting',
      onExitPresenting: navigation.exitPresenting,
    },
    addCard: {
      onAddCard: () => undefined,
      onAddAlias: () => undefined,
      onAddSpaceCard: () => undefined,
      keyShortcut: 'C',
      menuTriggerRef: addCardMenu,
    },
    createLayout: { refusal: null, onCreate: () => undefined },
    persistence: {
      control: (
        <PersistenceControl
          persistence={{ kind: 'settled' }}
          onAcceptRemote={() => null}
          onKeepLocal={() => undefined}
        />
      ),
      state: 'settled',
      acknowledgedRevision: 4n,
    },
  };
  const entry: OpenSpaceSidebar = {
    id: space.id,
    sidebar,
    status,
  };
  return { entry, layout: resolved.layout };
}

/** Fixture-only state around the production Open Spaces and Sidebar composition. */
export function OpenSpaceSidebarsFixture() {
  const authored = useOpenSpace(authoredSpace);
  const traversal = useOpenSpace(traversalSpace, 'failed');
  const deepDive = useOpenSpace(deepDiveSpace);
  const spaces = [authored.entry, traversal.entry, deepDive.entry] as const;
  const [activeId, setActiveId] = useState(traversal.entry.id);
  const selectedLayout =
    activeId === authored.entry.id
      ? authored.layout
      : activeId === deepDive.entry.id
        ? deepDive.layout
        : traversal.layout;

  return (
    <AppShell
      sidebar={<OpenSpaceSidebars spaces={spaces} activeId={activeId} onSelect={setActiveId} />}
      header={<SelectedLayoutName layout={selectedLayout} />}
    >
      <div className="h-full" data-testid="space-canvas-stand-in" />
    </AppShell>
  );
}
