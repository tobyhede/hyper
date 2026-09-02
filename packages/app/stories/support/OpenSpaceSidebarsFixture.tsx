import { useCallback, useMemo, useRef, useState } from 'react';
import type { Space } from '@project/graph';
import { AppShell } from '@project/ui';
import { canvasRenderers, currentRenderer } from '#src/canvas-renderers';
import { graphColorMap } from '#src/colors';
import { PersistenceControl } from '#components/PersistenceControl';
import { OpenSpaceSidebars, type OpenSpaceSidebar } from '#components/OpenSpaceSidebars';
import { SelectedCanvasRenderer, type SpaceSidebarProps } from '#components/SpaceSidebar';
import { useStoryNavigation } from './navigation';
import { authoredSpace, deepDiveSpace, traversalSpace } from './spaces';

function useOpenSpace(space: Space, status?: OpenSpaceSidebar['status']) {
  const readSpace = useCallback(() => space, [space]);
  const { navigation, state, resolveRenderer } = useStoryNavigation(readSpace);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  const renderers = canvasRenderers(space);
  const current = currentRenderer(renderers, state.selectedRenderer);
  const renderer = useMemo(
    () => resolveRenderer(space, state.selectedRenderer),
    [resolveRenderer, space, state.selectedRenderer],
  );
  const sidebar: SpaceSidebarProps = {
    spaceTitle: space.title,
    canvas: { renderers, current, onSelect: navigation.selectRenderer },
    graph: {
      graphs: renderer.subject.graphs,
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
  return { entry, current };
}

/** Fixture-only state around the production Open Spaces and Sidebar composition. */
export function OpenSpaceSidebarsFixture() {
  const authored = useOpenSpace(authoredSpace);
  const traversal = useOpenSpace(traversalSpace, 'failed');
  const deepDive = useOpenSpace(deepDiveSpace);
  const spaces = [authored.entry, traversal.entry, deepDive.entry] as const;
  const [activeId, setActiveId] = useState(traversal.entry.id);
  const current =
    activeId === authored.entry.id
      ? authored.current
      : activeId === deepDive.entry.id
        ? deepDive.current
        : traversal.current;

  return (
    <AppShell
      sidebar={<OpenSpaceSidebars spaces={spaces} activeId={activeId} onSelect={setActiveId} />}
      header={<SelectedCanvasRenderer renderer={current} />}
    >
      <div className="h-full" data-testid="space-canvas-stand-in" />
    </AppShell>
  );
}
