import { titleName } from '@project/core';
import { Alert, AlertDescription, AlertTitle, PresentedResource } from '@project/ui';
import type { PresentedNotes } from '../notes-window';
import './notes-window.css';

export interface PresentedNotesListProps {
  readonly notes: PresentedNotes;
}

/**
 * The presented Resource's notes (ADR 0129), each drawn by its kind as the
 * Stage draws it, or why there are none.
 *
 * One drawing, so the Notes window and the rehearsal notes under the Stage
 * cannot say different things about the same Resource.
 */
export function PresentedNotesList({ notes: presented }: PresentedNotesListProps) {
  if (presented.notesGraph === null) {
    return (
      <Alert>
        <AlertTitle>No notes for {titleName(presented.talk)}</AlertTitle>
        <AlertDescription>
          Notes come from a Graph on this Map titled “{titleName(presented.talk)} Presentation
          Notes”, or just “Notes”, with an Edge from each Resource to its notes.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <p className="notes-window__quiet">
        From {presented.notesGraph}
        {presented.passedOver.length > 0 ? `, passing over ${presented.passedOver.join(', ')}` : ''}
      </p>
      {presented.notes.length === 0 ? (
        <p className="notes-window__quiet">No notes for this Resource.</p>
      ) : (
        presented.notes.map((note) => (
          <PresentedResource key={note.resourceId} title={note.title} content={note.content} />
        ))
      )}
    </>
  );
}
