import { useCallback, useEffect, useState } from 'react';
import { newUuid } from '@project/core';
// Through the package's own subpath imports, as `#components/*` already is.
import { createNotesWindow } from '#src/notes-window';
import { presentingLink, type PresentationChannel } from '#src/presentation-link';
import { NotesWindowApplication } from '#components/NotesWindowApplication';
import { useStoryNavigation } from './navigation';
import { channelHub } from './presentations';
import { notesSpace } from './spaces';

/** When the story's presentation started, on the clock both windows share. */
const STARTED_AT = Date.UTC(2026, 9, 16, 9, 0, 0);
/** The time the Notes window reads, twelve and a half minutes into the talk. */
const NOW = STARTED_AT + 750_000;

export interface NotesWindowFixtureProps {
  /**
   * Whether the other window is presenting. When it is not, the Notes window
   * has nothing to follow.
   */
  readonly presenting?: boolean;
  /** How many production `advance()` calls the presentation opens with. */
  readonly advances?: number;
}

const linksOver = (channel: PresentationChannel, now: () => number) => ({
  open: () => channel,
  now,
  leaving: () => () => undefined,
  presence: { hold: () => () => undefined, watch: () => () => undefined },
});

/**
 * The unchanged production `NotesWindowApplication`, following a presentation
 * of real Navigation over a real presentation link.
 *
 * The presenting window is the other end of an in-memory channel, joined as
 * `BroadcastChannel` joins two windows. It has no Stage here, because the
 * claims are about what the Notes window draws and sends: a move pressed in the
 * Notes window reaches Navigation through the link, and what Navigation then
 * publishes is what the Notes window draws. The fixture holds no position of
 * its own.
 */
export function NotesWindowFixture({ presenting = true, advances = 0 }: NotesWindowFixtureProps) {
  const readSpace = useCallback(() => notesSpace, []);
  const { navigation } = useStoryNavigation(readSpace, (composed) => {
    if (!presenting) return;
    composed.present();
    for (let step = 0; step < advances; step += 1) composed.advance();
  });
  const [join] = useState(channelHub);
  const [stage] = useState(join);
  const [notes] = useState(() =>
    createNotesWindow({
      spaceId: notesSpace.id,
      space: notesSpace,
      reload: () => Promise.resolve(notesSpace),
      links: linksOver(join(), () => NOW),
      reportObserverError: (error) => console.error('Notes window story observer failed', error),
    }),
  );
  useEffect(
    () =>
      presentingLink({
        navigation,
        spaceId: () => notesSpace.id,
        links: linksOver(stage, () => STARTED_AT),
        newId: newUuid,
      }).connect(),
    [navigation, stage],
  );
  return <NotesWindowApplication notes={notes} now={() => NOW} />;
}
