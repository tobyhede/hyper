import type { UUID } from '@project/core';
import { OpenSpaces, Sidebar, type OpenSpaceStatus } from '@project/ui';
import { SpaceSidebar, type SpaceSidebarProps } from './SpaceSidebar';

export interface OpenSpaceSidebar {
  readonly id: UUID;
  readonly status?: OpenSpaceStatus | undefined;
  readonly sidebar: SpaceSidebarProps;
}

export interface OpenSpaceSidebarsProps {
  readonly spaces: readonly OpenSpaceSidebar[];
  readonly activeId: UUID;
  readonly onSelect: (id: UUID) => void;
}

/** One mounted Space Sidebar per open Space, with only the selected one shown. */
export function OpenSpaceSidebars({ spaces, activeId, onSelect }: OpenSpaceSidebarsProps) {
  return (
    <Sidebar collapsible="offcanvas" className="overflow-hidden">
      <OpenSpaces
        entries={spaces.map((space) => ({
          id: space.id,
          title: space.sidebar.spaceTitle,
          status: space.status,
          content: <SpaceSidebar {...space.sidebar} collapsible="none" className="h-full w-full" />,
        }))}
        activeId={activeId}
        // Not a pass-through: `OpenSpaces` is a presentation component and
        // keys its entries by plain `string`, so the id comes back unbranded.
        // The lookup is what turns it into the `UUID` this Space's own
        // `onSelect` takes, and it drops an id no open Space answers to.
        onSelect={(id) => {
          const selected = spaces.find((space) => space.id === id);
          if (selected !== undefined) onSelect(selected.id);
        }}
      />
    </Sidebar>
  );
}
