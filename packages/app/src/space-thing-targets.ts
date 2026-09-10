import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Thing, UUID } from '@project/core';
import { spaceThingTarget, type SpaceThingTarget } from './space-thing-lifecycle';
import { useOpenSpaces } from './open-spaces-context';

const NO_ENTRIES = [] as const;
const noSubscription = () => () => undefined;
const noEntries = () => NO_ENTRIES;

/** What every Space Thing on a canvas needs from the Spaces it references. */
export type SpaceThingTargets = ReadonlyMap<UUID, SpaceThingTarget>;

/** No Space Thing in this Space, or none read yet — one shared empty value. */
export const NO_SPACE_THING_TARGETS: SpaceThingTargets = new Map();

/** The distinct Spaces the Space Things of one Space reference, in authored order. */
const referencedSpaceIds = (things: readonly Thing[]): readonly UUID[] => [
  ...new Set(things.flatMap((thing) => (thing.kind === 'space' ? [thing.spaceId] : []))),
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
  | { readonly id: UUID; readonly answered: true; readonly target: SpaceThingTarget | undefined }
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
  previous: SpaceThingTargets,
): SpaceThingTargets => {
  const next = new Map<UUID, SpaceThingTarget>();
  for (const entry of reads) {
    const target = entry.answered ? entry.target : previous.get(entry.id);
    if (target !== undefined) next.set(entry.id, target);
  }
  return next;
};

/**
 * The target Spaces this Space's Space Things reference, read once each.
 *
 * Asynchronous because a target is a *different* Space: it is stored beside
 * this one rather than inside it, so nothing about the containing Space's
 * working state can say what its Diagrams are called (ADR 0068). The map is
 * therefore incomplete on the first render after a Space Thing appears, and every
 * surface reading it draws that Thing without its target's context until the read
 * lands — which is why `CanvasThing` takes an absent selection as a state rather
 * than as an error.
 *
 * Reads fill the unopened targets. Open Spaces publishes changes to its live
 * entries, and their current working Spaces override those reads immediately.
 */
export const useSpaceThingTargets = (
  things: readonly Thing[],
  read: (spaceId: UUID) => Promise<SpaceThingTarget | undefined>,
): SpaceThingTargets => {
  const spaces = useOpenSpaces();
  const getEntries = useCallback(() => spaces?.getState().entries ?? NO_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(
    spaces?.subscribe ?? noSubscription,
    spaces === null ? noEntries : getEntries,
  );
  const [targets, setTargets] = useState<SpaceThingTargets>(NO_SPACE_THING_TARGETS);
  /**
   * Which set of targets has been asked for, and which answer is still wanted.
   *
   * Two refs rather than an effect dependency on the ids, because the ids are a
   * fresh array on every render and a dependency on `things` alone re-runs on
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
   * answer this cleanup has just discarded. A Space Thing already on the canvas
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
    const ids = referencedSpaceIds(things);
    const key = ids.join(' ');
    if (key === requested.current) return;
    requested.current = key;
    generation.current += 1;
    const mine = generation.current;
    // Settled one target at a time rather than through one `Promise.all` that
    // rejects: each id is a read of a *different* Space, so one Space being
    // unreachable says nothing about the one the Thing beside it points at, and
    // failing the batch would hold every Space Thing on this canvas without its
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
  }, [things, read, entries]);

  return useMemo(() => {
    const live = new Map(targets);
    for (const entry of entries) {
      if (things.some((thing) => thing.kind === 'space' && thing.spaceId === entry.id)) {
        live.set(entry.id, spaceThingTarget(entry.app.currentSpace()));
      }
    }
    return live;
  }, [targets, entries, things]);
};
