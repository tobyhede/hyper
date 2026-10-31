import type { GraphId, MapId, ResourceId } from '@project/core';
import { resolveResourceContent, type Space } from '@project/graph';
import { PresentedResource, Stage } from '@project/ui';
import { presentedNotes } from '../notes-window';
import { presentedByApplication } from '../kinds/registry';
import { PresentedNotesList } from './PresentedNotesList';
import { PresentingChrome, type PresentingChromeProps } from './PresentingChrome';
import './rehearsal-notes.css';

export interface PresentingStageProps extends PresentingChromeProps {
  /** The Space the Resource being presented belongs to. */
  readonly space: Space;
  /** The Map the presentation is on, which places the notes. */
  readonly mapId: MapId;
  /** The Graph being presented, whose Presentation Notes Graph holds the notes. */
  readonly graphId: GraphId;
  /** The Resource Navigation is presenting. */
  readonly resourceId: ResourceId;
}

/**
 * Presenting's surface (ADR 0123): the Resource being presented on the Stage,
 * with the presenting chrome in the strip below the frame, and below that the
 * Resource's notes while the presenter rehearses with them (ADR 0129).
 *
 * The Resource is drawn by its kind, through the content
 * `resolveResourceContent` answers, and never by its position, size, Shape or
 * Open state on any Map — so nothing about how it sits on the canvas reaches
 * the audience. Nothing here authors the Space.
 */
export function PresentingStage({
  space,
  mapId,
  graphId,
  resourceId,
  ...chrome
}: PresentingStageProps) {
  const resource = space.lookup.resource(resourceId);
  if (resource === undefined) return null;
  const content = resolveResourceContent(space, resource);
  const notes = chrome.notesShown ? presentedNotes(space, mapId, graphId, resourceId) : undefined;
  return (
    <Stage
      label="Presented Resource"
      contentKey={resourceId}
      chrome={
        <>
          <PresentingChrome {...chrome} />
          {notes === undefined ? null : (
            // Keyed by the Resource, so each Resource's notes open scrolled to the top.
            <section key={resourceId} className="rehearsal-notes" aria-label="Rehearsal notes">
              <PresentedNotesList notes={notes} />
            </section>
          )}
        </>
      }
    >
      <PresentedResource title={resource.title} content={content}>
        {presentedByApplication(content)}
      </PresentedResource>
    </Stage>
  );
}
