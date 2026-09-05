import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Card, UUID } from '@project/core';
import { spaceCardTarget, type SpaceCardTarget } from './space-card-lifecycle';
import { useOpenSpaces } from './open-spaces-context';

const NO_ENTRIES = [] as const;
const noSubscription = () => () => undefined;
const noEntries = () => NO_ENTRIES;

/** What every Space Card on a canvas needs from the Spaces it references. */
export type SpaceCardTargets = ReadonlyMap<UUID, SpaceCardTarget>;

/** No Space Card in this Space, or none read yet — one shared empty value. */
export const NO_SPACE_CARD_TARGETS: SpaceCardTargets = new Map();

/** The distinct Spaces the Space Cards of one Space reference, in authored order. */
const referencedSpaceIds = (cards: readonly Card[]): readonly UUID[] => [
  ...new Set(cards.flatMap((card) => (card.kind === 'space' ? [card.spaceId] : []))),
];

/**
 * What one target's read came back with, kept apart from the others'.
 *
 * `answered` separates the two things an absent target can mean, which is the
 * whole reason the reads are settled one by one: `read` resolves `undefined`
 * for a Space that is gone or no longer passes intake — an answer *about* that
 * Space — and rejects when the transport could not get one at all.
 */
type TargetRead =
  | { readonly id: UUID; readonly answered: true; readonly target: SpaceCardTarget | undefined }
  | { readonly id: UUID; readonly answered: false };

/**
 * The map one batch of reads leaves behind, over the one it replaces.
 *
 * Keyed and ordered by the ids just asked for, so a Space no longer referenced
 * drops out rather than accumulating. A failed read contributes whatever that
 * target already had: it is not an answer, so it neither installs nor erases.
 */
const nextTargets = (
  reads: readonly TargetRead[],
  previous: SpaceCardTargets,
): SpaceCardTargets => {
  const next = new Map<UUID, SpaceCardTarget>();
  for (const entry of reads) {
    const target = entry.answered ? entry.target : previous.get(entry.id);
    if (target !== undefined) next.set(entry.id, target);
  }
  return next;
};

/**
 * The target Spaces this Space's Space Cards reference, read once each.
 *
 * Asynchronous because a target is a *different* Space: it is stored beside
 * this one rather than inside it, so nothing about the containing Space's
 * working state can say what its Layouts are called (ADR 0068). The map is
 * therefore incomplete on the first render after a Space Card appears, and every
 * surface reading it draws that Card without its target's context until the read
 * lands — which is why `CanvasCard` takes an absent selection as a state rather
 * than as an error.
 *
 * Reads fill the unopened targets. Open Spaces publishes changes to its live
 * entries, and their current working Spaces override those reads immediately.
 */
export const useSpaceCardTargets = (
  cards: readonly Card[],
  read: (spaceId: UUID) => Promise<SpaceCardTarget | undefined>,
): SpaceCardTargets => {
  const spaces = useOpenSpaces();
  const getEntries = useCallback(() => spaces?.getState().entries ?? NO_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(
    spaces?.subscribe ?? noSubscription,
    spaces === null ? noEntries : getEntries,
  );
  const [targets, setTargets] = useState<SpaceCardTargets>(NO_SPACE_CARD_TARGETS);
  /**
   * Which set of targets has been asked for, and which answer is still wanted.
   *
   * Two refs rather than an effect dependency on the ids, because the ids are a
   * fresh array on every render and a dependency on `cards` alone re-runs on
   * every completed Edit in this Space — neither of which is a reason to read
   * another Space again. The generation is what an answer is checked against:
   * a set that changes twice quickly leaves two reads in flight, and the older
   * one must not install its map over the newer.
   */
  const requested = useRef<string | null>(null);
  const generation = useRef(0);

  /**
   * Unmounting invalidates the answer still in flight, and releases the request
   * that would stop the next mount asking for it again.
   *
   * Both, and the second is what `StrictMode` needs: its setup → cleanup →
   * setup runs this cleanup between the two setups, and a key still recorded
   * would send the second setup down the early return below — into a read whose
   * answer this cleanup has just discarded. A Space Card already on the canvas
   * when the app mounts would then never draw its target, because nothing after
   * the first render changes the set of referenced Spaces.
   */
  useEffect(
    () => () => {
      generation.current += 1;
      requested.current = null;
    },
    [],
  );

  const previousEntries = useRef(entries);
  useEffect(() => {
    if (previousEntries.current.some((entry) => !entries.includes(entry))) requested.current = null;
    previousEntries.current = entries;
    const ids = referencedSpaceIds(cards);
    const key = ids.join(' ');
    if (key === requested.current) return;
    requested.current = key;
    generation.current += 1;
    const mine = generation.current;
    // Settled one target at a time rather than through one `Promise.all` that
    // rejects: each id is a read of a *different* Space, so one Space being
    // unreachable says nothing about the one the Card beside it points at, and
    // failing the batch would hold every Space Card on this canvas without its
    // title and selectors on account of a single bad target — on the first read
    // and again on every retry, since the bad target keeps failing.
    void Promise.all(
      ids.map((id): Promise<TargetRead> =>
        read(id).then(
          (target) => ({ id, answered: true, target }),
          () => ({ id, answered: false }),
        ),
      ),
    ).then((reads) => {
      if (generation.current !== mine) return;
      // A rejected read is not an answer, so the *set* must not stand as read.
      // The transport rejects on a non-OK status, a network failure and its own
      // timeout, and recording the set as read regardless would leave the
      // targets that failed unread for the life of the page. Releasing the key
      // is the whole of the recovery: this effect runs again on the next
      // completed Edit in this Space, and asks the whole set again — the
      // targets that answered included, which is what keeps one live set of
      // ids answered by one batch rather than by a growing pile of retries.
      if (reads.some(({ answered }) => !answered)) requested.current = null;
      setTargets((previous) => nextTargets(reads, previous));
    });
  }, [cards, read, entries]);

  return useMemo(() => {
    const live = new Map(targets);
    for (const entry of entries) {
      if (cards.some((card) => card.kind === 'space' && card.spaceId === entry.id)) {
        live.set(entry.id, spaceCardTarget(entry.app.currentSpace()));
      }
    }
    return live;
  }, [targets, entries, cards]);
};
