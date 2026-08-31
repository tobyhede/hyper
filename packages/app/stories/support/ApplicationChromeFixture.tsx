import type { ComponentProps, DragEvent, ReactNode } from 'react';
import { LayoutCanvasFixture, type FixtureCanvasCard } from './ReactFlowCanvas';
import { SpaceSidebarFixture, type SpaceSidebarFixtureProps } from './SpaceSidebarFixture';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface ApplicationChromeFixtureProps extends Pick<
  SpaceSidebarFixtureProps,
  'space' | 'persistence' | 'presenting' | 'entityActions'
> {
  readonly headerActions?: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly canvasCards?: readonly FixtureCanvasCard[];
  readonly canvasOverlay?: ReactNode;
  readonly onCanvasDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  readonly onCanvasDrop?: (event: DragEvent<HTMLDivElement>) => void;
}

/**
 * Reusable Ladle application harness composed entirely from production chrome:
 * AppShell, SpaceSidebar, selected-renderer header and the real React Flow
 * adapter canvas. Stories supply state and optional surface slots, not replicas.
 */
export function ApplicationChromeFixture({
  space,
  persistence,
  presenting,
  entityActions,
  headerActions,
  rightPanel,
  canvasCards,
  canvasOverlay,
  onCanvasDragOver,
  onCanvasDrop,
}: ApplicationChromeFixtureProps) {
  const sidebarOptionalProps: Mutable<
    Pick<
      SpaceSidebarFixtureProps,
      'space' | 'persistence' | 'presenting' | 'headerActions' | 'entityActions'
    >
  > = {};
  if (space !== undefined) sidebarOptionalProps.space = space;
  if (persistence !== undefined) sidebarOptionalProps.persistence = persistence;
  if (presenting !== undefined) sidebarOptionalProps.presenting = presenting;
  if (headerActions !== undefined) sidebarOptionalProps.headerActions = headerActions;
  if (entityActions !== undefined) sidebarOptionalProps.entityActions = entityActions;
  const canvasOptionalProps: Mutable<Pick<ComponentProps<typeof LayoutCanvasFixture>, 'cards'>> =
    {};
  if (canvasCards !== undefined) canvasOptionalProps.cards = canvasCards;

  return (
    <SpaceSidebarFixture {...sidebarOptionalProps} showCardLinks={false} showGraphLinks={false}>
      <div className="flex size-full min-w-0">
        <div
          className="relative min-w-0 flex-1"
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
        >
          <LayoutCanvasFixture {...canvasOptionalProps} />
          {canvasOverlay}
        </div>
        {rightPanel}
      </div>
    </SpaceSidebarFixture>
  );
}
