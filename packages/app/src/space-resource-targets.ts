import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Resource, UUID } from '@project/core';
import {
  spaceResourceTarget,
  type SpaceResourceAuthoring,
  type SpaceResourceTarget,
} from './space-resource-lifecycle';
import { useOpenSpaces } from './open-spaces-context';

const NO_ENTRIES = [] as const;
const noSubscription = () => () => undefined;
const noEntries = () => NO_ENTRIES;

/** What every Space Resource on a canvas needs from the Spaces it references. */
export type SpaceResourceTargets = ReadonlyMap<UUID, SpaceResourceTarget>;

/** No Space Resource in this Space, or none read yet — one shared empty value. */
export const NO_SPACE_RESOURCE_TARGETS: SpaceResourceTargets = new Map();

/** The distinct Spaces the Space Resources of one Space reference, in authored order. */
const referencedSpaceIds = (resources: readonly Resource[]): readonly UUID[] => [
  ...new Set(
    resources.flatMap((resource) => (resource.kind === 'space' ? [resource.spaceId] : [])),
  ),
];

/**
 * What one target's read came back with, kept apart from the others'.
 *
 * `answered` separates the two states an absent target can represent, which is the
 * whole reason the reads are settled one by one: `read` resolves `undefined`
 * for a Space that is gone or no longer passes intake — an answer *about* that
 * Space — and rejects when the transport could not get one at all.
 */
type TargetRead =
  | { readonly id: UUID; readonly answered: true; readonly target: SpaceResourceTarget | undefined }
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
  previous: SpaceResourceTargets,
): SpaceResourceTargets => {
  const next = new Map<UUID, SpaceResourceTarget>();
  for (const entry of reads) {
    const target = entry.answered ? entry.target : previous.get(entry.id);
    if (target !== undefined) next.set(entry.id, target);
  }
  return next;
};

/**
 * The target Spaces this Space's Space Resources reference, read once each.
 *
 * Asynchronous because a target is a *different* Space: it is stored beside
 * this one rather than inside it, so nothing about the containing Space's
 * working state can say what its Maps are called (ADR 0068). The map is
 * therefore incomplete on the first render after a Space Resource appears, and every
 * surface reading it draws that Resource without its target's context until the read
 * lands — which is why `CanvasResource` takes an absent selection as a state rather
 * than as an error.
 *
 * Reads fill the unopened targets. Open Spaces publishes changes to its live
 * entries, and their current working Spaces override those reads immediately.
 */
export const useSpaceResourceTargets = (
  resources: readonly Resource[],
  read: (spaceId: UUID) => Promise<SpaceResourceTarget | undefined>,
): SpaceResourceTargets => {
  const spaces = useOpenSpaces();
  const getEntries = useCallback(() => spaces?.getState().entries ?? NO_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(
    spaces?.subscribe ?? noSubscription,
    spaces === null ? noEntries : getEntries,
  );
  const [targets, setTargets] = useState<SpaceResourceTargets>(NO_SPACE_RESOURCE_TARGETS);
  /**
   * Which set of targets has been asked for, and which answer is still wanted.
   *
   * Two refs rather than an effect dependency on the ids, because the ids are a
   * fresh array on every render and a dependency on `resources` alone re-runs on
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
   * answer this cleanup has just discarded. A Space Resource already on the canvas
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
    const ids = referencedSpaceIds(resources);
    const key = ids.join(' ');
    if (key === requested.current) return;
    requested.current = key;
    generation.current += 1;
    const mine = generation.current;
    // Settled one target at a time rather than through one `Promise.all` that
    // rejects: each id is a read of a *different* Space, so one Space being
    // unreachable says nothing about the one the Resource beside it points at, and
    // failing the batch would hold every Space Resource on this canvas without its
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
  }, [resources, read, entries]);

  return useMemo(() => {
    const live = new Map(targets);
    for (const entry of entries) {
      if (
        resources.some((resource) => resource.kind === 'space' && resource.spaceId === entry.id)
      ) {
        live.set(entry.id, spaceResourceTarget(entry.app.currentSpace()));
      }
    }
    return live;
  }, [targets, entries, resources]);
};

/** The Title of each referenced Space, by its id. */
export const spaceTitlesById = (targets: SpaceResourceTargets): ReadonlyMap<UUID, string> =>
  new Map([...targets].map(([id, target]) => [id, target.title]));

export interface SpaceResourceTargetTitles {
  readonly targets: SpaceResourceTargets;
  readonly titleById: ReadonlyMap<UUID, string>;
}

/**
 * The targets of one Space's Space Resources, read through its lifecycle, and
 * their Titles.
 *
 * One read per set of referenced Spaces, shared by the canvas and the Resources
 * list, so a Space Resource names the same Space wherever it is drawn.
 */
export const useSpaceResourceTargetTitles = (
  source: Pick<SpaceResourceAuthoring, 'target'>,
  resources: readonly Resource[],
): SpaceResourceTargetTitles => {
  const read = useCallback((spaceId: UUID) => source.target(spaceId), [source]);
  const targets = useSpaceResourceTargets(resources, read);
  const titleById = useMemo(() => spaceTitlesById(targets), [targets]);
  return { targets, titleById };
};
