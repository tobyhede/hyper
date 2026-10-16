import { titleName } from '@project/core';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Kbd,
  PresentedResource,
  Separator,
} from '@project/ui';
import {
  elapsedLabel,
  type NotesMove,
  type NotesView,
  type NotesWindowState,
} from '../notes-window';
import './notes-window.css';

export interface NotesWindowProps {
  readonly state: NotesWindowState;
  /** Milliseconds since the presentation started, or since the timer was last reset. */
  readonly elapsed: number;
  readonly onResetTimer: () => void;
  readonly onAdvance: () => void;
  readonly onRetreat: () => void;
  /** Move the selection by a signed number of places, as Up and Down do on the Stage. */
  readonly onSelectBranch: (delta: number) => void;
}

/**
 * The Notes window (ADR 0129): the presented Resource's notes, the moves from
 * it with a preview of each, and the time since presenting started.
 *
 * It follows a presentation and authors nothing. Its controls send the
 * presenting window what the Stage's own keys do, and nothing it draws reaches
 * the Stage.
 */
export function NotesWindow({
  state,
  elapsed,
  onResetTimer,
  onAdvance,
  onRetreat,
  onSelectBranch,
}: NotesWindowProps) {
  return (
    <main className="notes-window" aria-label="Notes window">
      <header className="notes-window__header">
        <h1 className="notes-window__talk">
          {state.kind === 'presenting' ? titleName(state.view.talk) : 'Notes'}
        </h1>
        {state.kind === 'presenting' ? (
          <div className="notes-window__timer">
            <output aria-label="Elapsed time" className="notes-window__elapsed">
              {elapsedLabel(elapsed)}
            </output>
            <Button variant="secondary" size="compact" onClick={onResetTimer}>
              Reset timer
            </Button>
          </div>
        ) : null}
      </header>
      {state.kind === 'presenting' ? (
        <Presenting
          view={state.view}
          onAdvance={onAdvance}
          onRetreat={onRetreat}
          onSelectBranch={onSelectBranch}
        />
      ) : (
        <Alert>
          <AlertTitle>Not presenting</AlertTitle>
          <AlertDescription>
            Present this Space in another window of this browser, and this window follows it.
          </AlertDescription>
        </Alert>
      )}
    </main>
  );
}

interface PresentingProps {
  readonly view: NotesView;
  readonly onAdvance: () => void;
  readonly onRetreat: () => void;
  readonly onSelectBranch: (delta: number) => void;
}

function Presenting({ view, onAdvance, onRetreat, onSelectBranch }: PresentingProps) {
  const selectedIndex = view.moves.findIndex((move) => move.selected);
  const go = (move: NotesMove, index: number) => () => {
    if (move.selected) onAdvance();
    else onSelectBranch(index - selectedIndex);
  };
  return (
    <>
      <p className="notes-window__now">
        Presenting <strong>{titleName(view.presented.title)}</strong>
      </p>
      <section className="notes-window__section" aria-label="Notes">
        <Notes view={view} />
      </section>
      <Separator />
      <section className="notes-window__section" aria-label="Moves">
        {view.moves.length === 0 ? (
          <p className="notes-window__quiet">This is the end of the talk.</p>
        ) : (
          <ul className="notes-window__moves">
            {view.moves.map((move, index) => (
              <li key={move.resourceId} className="notes-window__move">
                <Button variant={move.selected ? 'default' : 'secondary'} onClick={go(move, index)}>
                  {move.selected ? 'Go to' : 'Choose'} {titleName(move.title)}
                </Button>
                <div
                  className="notes-window__preview"
                  aria-label={`Preview of ${titleName(move.title)}`}
                  role="figure"
                >
                  <PresentedResource title={move.title} content={move.content} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="notes-window__keys">
          {view.canRetreat ? (
            <Button variant="secondary" onClick={onRetreat}>
              Back
            </Button>
          ) : null}
          <span className="notes-window__quiet">
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> choose, <Kbd>→</Kbd> go, <Kbd>←</Kbd> back
          </span>
        </div>
      </section>
    </>
  );
}

function Notes({ view }: { readonly view: NotesView }) {
  if (view.notesGraph === null) {
    return (
      <Alert>
        <AlertTitle>No notes for {titleName(view.talk)}</AlertTitle>
        <AlertDescription>
          Notes come from a Graph on this Map titled “{titleName(view.talk)} Presentation Notes”, or
          just “Notes”, with an Edge from each Resource to its notes.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <p className="notes-window__quiet">
        From {view.notesGraph}
        {view.passedOver.length > 0 ? `, passing over ${view.passedOver.join(', ')}` : ''}
      </p>
      {view.notes.length === 0 ? (
        <p className="notes-window__quiet">No notes for this Resource.</p>
      ) : (
        view.notes.map((note) => (
          <PresentedResource key={note.resourceId} title={note.title} content={note.content} />
        ))
      )}
    </>
  );
}
