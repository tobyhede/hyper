import type { ResourceId } from '@project/core';
import { resolveResourceContent, type Space } from '@project/graph';
import { PresentedResource, Stage } from '@project/ui';
import { PresentingChrome, type PresentingChromeProps } from './PresentingChrome';

export interface PresentingStageProps extends PresentingChromeProps {
  /** The Space the Resource being presented belongs to. */
  readonly space: Space;
  /** The Resource Navigation is presenting. */
  readonly resourceId: ResourceId;
}

/**
 * Presenting's surface (ADR 0123): the Resource being presented on the Stage,
 * with the presenting chrome in the strip below the frame.
 *
 * The Resource is drawn by its kind, through the content
 * `resolveResourceContent` answers, and never by its position, size, Shape or
 * Open state on any Map — so nothing about how it sits on the canvas reaches
 * the audience. Nothing here authors the Space.
 */
export function PresentingStage({ space, resourceId, ...chrome }: PresentingStageProps) {
  const resource = space.lookup.resource(resourceId);
  if (resource === undefined) return null;
  return (
    <Stage
      label="Presented Resource"
      contentKey={resourceId}
      chrome={<PresentingChrome {...chrome} />}
    >
      <PresentedResource title={resource.title} content={resolveResourceContent(space, resource)} />
    </Stage>
  );
}
