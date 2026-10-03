import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ResourceId } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  discoverEmbeddedOpenSpaceResources,
  type EmbeddedOpenSpaceResourceRequest,
  type EmbeddedRoot,
} from './embedded-open-space-resource';
import type { EmbeddedPublication } from './embedded-publication';
import type { OpenSpace, SpaceHold } from './open-spaces';
import type { SpaceResourceFraming } from './space-resource-framing';

const EMPTY_ENTRIES = [] as const;
const EMPTY_PORTALS: ReadonlySet<ResourceId> = new Set();
const emptySubscription = () => () => undefined;

/**
 * What a drawing asks of Open Spaces: live compositions and one hold per occurrence.
 */
export interface EmbeddedTargetReader {
  readonly getState: () => { readonly composed: readonly OpenSpace[] };
  readonly subscribe: (listener: () => void) => () => void;
  readonly hold: (spaceId: ResourceId) => Promise<Pick<SpaceHold, 'release'>>;
}

export interface EmbeddedOpenSpaceResources {
  readonly embeddedRequests: readonly EmbeddedOpenSpaceResourceRequest<OpenSpace>[];
  readonly embeddedPublications: ReadonlyMap<string, EmbeddedPublication>;
  readonly embeddedFailures: ReadonlyMap<ResourceId, string>;
  readonly resumeEmbedded: (spaceId: ResourceId) => Promise<void>;
  readonly publishEmbedded: (id: string, value: EmbeddedPublication | null) => void;
  readonly reportBodyHeight: (id: string, height: number | null) => void;
  readonly editingPortals: ReadonlySet<ResourceId>;
  readonly onPortalEditingChange: (resourceId: ResourceId, editing: boolean) => void;
  readonly portalDraft: ReadonlyMap<ResourceId, SpaceResourceFraming>;
  readonly setPortalDraft: Dispatch<SetStateAction<ReadonlyMap<ResourceId, SpaceResourceFraming>>>;
}

/**
 * Target-read scheduling, embed failures, publication registry, and edit-portal
 * state for nested Open Space Resources. Mounting and clip-path stay with the canvas.
 */
export function useEmbeddedOpenSpaceResources(
  nodes: readonly ResourceFlowNode[],
  spaces: EmbeddedTargetReader | null,
  draggingIds: ReadonlySet<string>,
  root: EmbeddedRoot,
  projectionReady = true,
): EmbeddedOpenSpaceResources {
  const getEntries = useCallback(() => spaces?.getState().composed ?? EMPTY_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(spaces?.subscribe ?? emptySubscription, getEntries);
  const [embeddedPublications, setEmbeddedPublications] = useState<
    ReadonlyMap<string, EmbeddedPublication>
  >(new Map());
  /**
   * What each target could not be read with, kept apart from the others'.
   *
   * Not one string for the whole canvas: every embedding would then answer for
   * every other — any target that opened would clear a sentence raised by a
   * different Space Resource, and the one on screen would never say which
   * target it was about. Keyed by the Space the read was aimed at, because that is what
   * `spaces.hold` is asked for — two Resources reaching the same missing Space
   * are reporting one failure, and each names itself where it is drawn.
   */
  const [embeddedFailures, setEmbeddedFailures] = useState<ReadonlyMap<ResourceId, string>>(
    new Map(),
  );
  const [bodyHeights, setBodyHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [editingPortals, setEditingPortals] = useState<ReadonlySet<ResourceId>>(EMPTY_PORTALS);
  const [portalDraft, setPortalDraft] = useState<ReadonlyMap<ResourceId, SpaceResourceFraming>>(
    () => new Map(),
  );
  const onPortalEditingChange = useCallback((resourceId: ResourceId, editing: boolean) => {
    setEditingPortals((previous) => {
      const has = previous.has(resourceId);
      if (editing === has) return previous;
      const next = new Set(previous);
      if (editing) next.add(resourceId);
      else next.delete(resourceId);
      return next;
    });
  }, []);
  const reportBodyHeight = useCallback((id: string, height: number | null) => {
    setBodyHeights((previous) => {
      // A non-positive height is not a measured footer.
      if (height !== null && height <= 0) return previous;
      if (height === null ? !previous.has(id) : previous.get(id) === height) return previous;
      const next = new Map(previous);
      if (height === null) next.delete(id);
      else next.set(id, height);
      return next;
    });
  }, []);
  const embeddedRequests = useMemo(
    () =>
      discoverEmbeddedOpenSpaceResources({
        root,
        editingResources: editingPortals,
        staleSpaces: new Set(embeddedFailures.keys()),
        nodes,
        entries,
        publications: embeddedPublications,
        bodyHeights,
        draggingIds,
      }),
    [
      nodes,
      entries,
      embeddedPublications,
      bodyHeights,
      draggingIds,
      root,
      editingPortals,
      embeddedFailures,
    ],
  );
  /**
   * A read outlives its embedding only while the *target* is gone.
   *
   * That is the Exit case: the request still stands, `request.entry` is
   * `undefined`, and the last read is what the retained read-only drawing is
   * made of. A Space Resource that is simply **Closed** makes no request at all, so
   * its read ends with it — a publication left in the map would be picked up as
   * *live* by the next Open of that same Resource at that same Map, one commit
   * of nodes whose `changeNodes` and `removeResource` are bound to a composition
   * whose `observe()` was torn down, and it would seed the nested traversal
   * from a Map nobody is reading any more.
   *
   * Adjusted during render: React discards this pass, so neither the DOM nor
   * the load effect ever sees the requests the dead publication produced.
   */
  if (embeddedPublications.size > 0) {
    const standing = new Set(embeddedRequests.map((request) => request.parent.id));
    if ([...embeddedPublications.keys()].some((id) => !standing.has(id))) {
      setEmbeddedPublications(
        new Map([...embeddedPublications].filter(([id]) => standing.has(id))),
      );
    }
  }
  // A refusal belongs to the embedding that asked for the read, so it goes the
  // same way: no standing request means nothing left to announce it on.
  // `use-embedded-open-space-resources.test.ts` ('drops a failure whose embedding
  // is no longer standing') holds that prune.
  if (embeddedFailures.size > 0) {
    const asked = new Set(embeddedRequests.map((request) => request.spaceId));
    if ([...embeddedFailures.keys()].some((spaceId) => !asked.has(spaceId))) {
      setEmbeddedFailures(new Map([...embeddedFailures].filter(([id]) => asked.has(id))));
    }
  }
  const requested = useRef(
    new Map<
      string,
      {
        readonly spaceId: ResourceId;
        hold?: Pick<SpaceHold, 'release'>;
      }
    >(),
  );
  const acquire = useCallback(
    async (id: string, spaceId: ResourceId) => {
      if (spaces === null) return;
      const request: { readonly spaceId: ResourceId; hold?: Pick<SpaceHold, 'release'> } = {
        spaceId,
      };
      requested.current.set(id, request);
      try {
        const hold = await spaces.hold(spaceId);
        if (requested.current.get(id) !== request) {
          await hold.release();
          return;
        }
        request.hold = hold;
        setEmbeddedFailures((previous) =>
          previous.has(spaceId)
            ? new Map([...previous].filter(([key]) => key !== spaceId))
            : previous,
        );
      } catch (error) {
        if (requested.current.get(id) !== request) return;
        const message = error instanceof Error ? error.message : String(error);
        setEmbeddedFailures((previous) =>
          previous.get(spaceId) === message ? previous : new Map(previous).set(spaceId, message),
        );
      }
    },
    [spaces],
  );
  const resumeEmbedded = useCallback(
    async (spaceId: ResourceId) => {
      await Promise.all(
        [...requested.current]
          .filter(([, request]) => request.spaceId === spaceId)
          .map(async ([id, request]) => {
            if (request.hold !== undefined) return;
            await acquire(id, spaceId);
          }),
      );
    },
    [acquire],
  );
  useEffect(() => {
    const claims = requested.current;
    return () => {
      for (const request of claims.values()) {
        void request.hold?.release();
      }
      claims.clear();
    };
  }, [spaces]);
  useEffect(() => {
    if (!projectionReady) return;
    const visible = new Map(
      embeddedRequests.map((request) => [
        `${request.parent.id}:${request.spaceId}:${request.mapId}:${request.graphId}`,
        request,
      ]),
    );
    for (const [id, request] of requested.current) {
      if (visible.has(id)) continue;
      void request.hold?.release();
      requested.current.delete(id);
    }
    for (const [id, request] of visible) {
      if (!requested.current.has(id)) void acquire(id, request.spaceId);
    }
  }, [embeddedRequests, acquire, projectionReady]);
  const publishEmbedded = useCallback((id: string, value: EmbeddedPublication | null) => {
    setEmbeddedPublications((previous) => {
      if (previous.get(id) === value || (value === null && !previous.has(id))) return previous;
      const next = new Map(previous);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  }, []);
  return {
    embeddedRequests,
    embeddedPublications,
    embeddedFailures,
    resumeEmbedded,
    publishEmbedded,
    reportBodyHeight,
    editingPortals,
    onPortalEditingChange,
    portalDraft,
    setPortalDraft,
  };
}
