import { useEffect, useRef, useState } from 'react';
import type { UUID } from '@project/core';
import type { ObserverErrorReporter, SpaceSummary } from '@project/persistence';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

export type ReferenceableSpacesSource = Pick<
  SpaceResourceAuthoring,
  'spaceSet' | 'referenceableSpaces'
>;

/**
 * The Spaces the Resources list offers, and when they are re-read.
 *
 * **A repository read rather than a derivation of this Space**, because the
 * Meta Space's Spaces are not this Space's Resources — ADR 0074 makes a Space
 * reachable through the Space Resources that reference it, and the list offers
 * the Spaces themselves so a reader can frame one that nothing here points at
 * yet. `referenceableSpaces` withholds the containing Space, which is the one
 * target that cannot work whatever else is stored.
 *
 * **Re-read on the lifecycle's epoch rather than on every working snapshot**:
 * the set only changes when a Space is created or destroyed, which happens
 * through the coordinated lifecycle, so one bump per such Edit costs one read
 * where keying on the snapshot would cost one per keystroke. The epoch is the
 * session's because the Edit that moves it is coordinated across Spaces, and
 * every open Space stays mounted with its own list (ADR 0074, ADR 0076).
 *
 * **The epoch invalidates rather than fetches.** Only the drawn Space
 * subscribes, a read first compares the epoch it last answered, and a Space
 * that was hidden across an Edit reads once, when it is shown — so one Edit is
 * one repository read however many Spaces are open.
 */
export function useReferenceableSpaces(
  active: boolean,
  source: ReferenceableSpacesSource,
  containingSpaceId: () => UUID,
  reportBreak: ObserverErrorReporter,
): readonly SpaceSummary[] {
  const [spaces, setSpaces] = useState<readonly SpaceSummary[]>([]);
  // Last read wins, by token rather than by a cancelled flag: two reads can be
  // in flight across a quick pair of Edits, and the one that started first may
  // answer last.
  const latestRead = useRef(0);
  /**
   * The epoch `spaces` answers, or `null` for a list never read.
   *
   * A ref rather than state, because it decides whether to read and never what
   * to draw.
   */
  const readEpoch = useRef<number | null>(null);
  useEffect(() => {
    // Not subscribed at all while hidden, rather than subscribed and returning
    // early: a subscriber that decides to do nothing has still woken every
    // hidden Space on every Edit.
    if (!active) return;
    const read = (): void => {
      const epoch = source.spaceSet.getState();
      if (readEpoch.current === epoch) return;
      readEpoch.current = epoch;
      const token = latestRead.current + 1;
      latestRead.current = token;
      void (async () => {
        try {
          const answered = await source.referenceableSpaces(containingSpaceId());
          if (latestRead.current === token) setSpaces(answered);
        } catch (failure) {
          // Reported rather than drawn: the list's own empty state says what it
          // has, and a Spaces read that failed is not a refusal of anything the
          // reader asked for. An overtaken read is still reported, because it
          // still failed, but it changes nothing a later read answered.
          reportBreak(failure);
          if (latestRead.current !== token) return;
          // The epoch goes back, so this Space's next showing retries rather
          // than standing on an empty list until the Space set changes. While
          // it stays shown nothing retries; Meta's row does not depend on it
          // (`space-set-freshness.test.tsx`, "lists a closed Meta by its title
          // when the Space list read fails").
          readEpoch.current = null;
          setSpaces([]);
        }
      })();
    };
    read();
    return source.spaceSet.subscribe(read);
  }, [active, source, containingSpaceId, reportBreak]);
  return spaces;
}
