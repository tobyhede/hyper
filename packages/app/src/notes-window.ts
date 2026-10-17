import type { ResourceContent, ResourceId, UUID } from '@project/core';
import { presentationNotes, resolveResourceContent, type Space } from '@project/graph';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import {
  followPresentation,
  type FollowedPresentation,
  type PresentationLinks,
  type PresentationSnapshot,
} from './presentation-link';

/** One Resource as the Notes window draws it: by kind, through its resolved content. */
export interface NotesResource {
  readonly resourceId: ResourceId;
  readonly title: string;
  readonly content: ResourceContent;
}

/** A move from the presented Resource, with the Resource it goes to. */
export interface NotesMove extends NotesResource {
  readonly selected: boolean;
}

/** What the Notes window shows while the presentation it follows lasts. */
export interface NotesView {
  /** The Title of the Graph being presented. */
  readonly talk: string;
  readonly presented: NotesResource;
  /** The Presentation Notes Graph's Title, or `null` when the talk has none. */
  readonly notesGraph: string | null;
  /** The Titles of the other Graphs that also read as notes, which were passed over. */
  readonly passedOver: readonly string[];
  readonly notes: readonly NotesResource[];
  readonly moves: readonly NotesMove[];
  readonly canRetreat: boolean;
  readonly startedAt: number;
}

const drawn = (space: Space, resourceId: ResourceId): NotesResource | undefined => {
  const resource = space.lookup.resource(resourceId);
  return resource === undefined
    ? undefined
    : { resourceId, title: resource.title, content: resolveResourceContent(space, resource) };
};

/**
 * What a presentation's snapshot shows, read against the Notes window's own
 * copy of the Space, or `undefined` when that copy does not hold what the
 * snapshot names, which means it is out of date.
 */
export function notesView(space: Space, snapshot: PresentationSnapshot): NotesView | undefined {
  const shown = space.lookup.map(snapshot.mapId)?.map;
  const talk = space.lookup.graph(snapshot.graphId)?.graph;
  const presented = drawn(space, snapshot.resourceId);
  if (shown === undefined || talk === undefined || presented === undefined) return undefined;
  const found = presentationNotes(shown, talk, snapshot.resourceId);
  const notes = found.notes.flatMap((id) => drawn(space, id) ?? []);
  const moves = snapshot.moves.flatMap(({ resourceId, selected }) => {
    const target = drawn(space, resourceId);
    return target === undefined ? [] : [{ ...target, selected }];
  });
  if (notes.length !== found.notes.length || moves.length !== snapshot.moves.length)
    return undefined;
  return {
    talk: talk.title,
    presented,
    notesGraph: found.graph?.title ?? null,
    passedOver: found.passedOver.map((graph) => graph.title),
    notes,
    moves,
    canRetreat: snapshot.canRetreat,
    startedAt: snapshot.startedAt,
  };
}

/** Elapsed time as a presenter reads it: minutes and seconds, and hours once there are any. */
export function elapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const two = (value: number): string => value.toString().padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${two(minutes)}:${two(rest)}`;
}

export type NotesWindowState =
  { readonly kind: 'not-presenting' } | { readonly kind: 'presenting'; readonly view: NotesView };

export interface NotesWindow {
  readonly getState: () => NotesWindowState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly advance: () => void;
  readonly retreat: () => void;
  readonly selectBranch: (delta: number) => void;
  /** Follow until the returned function is called. */
  readonly connect: () => () => void;
}

export interface NotesWindowDependencies {
  readonly spaceId: UUID;
  /** The Space as this window first loaded it. */
  readonly space: Space;
  /**
   * The Space as the store holds it now, or `undefined` when it no longer
   * holds it. Asked when a presentation names something this window's copy
   * does not hold.
   */
  readonly reload: () => Promise<Space | undefined>;
  readonly links: PresentationLinks;
  readonly reportObserverError: ObserverErrorReporter;
}

const NOT_PRESENTING: NotesWindowState = { kind: 'not-presenting' };

/**
 * A Notes window (ADR 0129): it follows the presentation of one Space and
 * draws the presented Resource's notes, and the moves from it, from its own
 * copy of the Space.
 *
 * The presenting window sends identities, never content. When one names
 * something this window's copy does not hold, an Edit has happened since it
 * loaded, so it reloads the Space and draws the presentation once it has.
 */
export function createNotesWindow({
  spaceId,
  space: initial,
  reload,
  links,
  reportObserverError,
}: NotesWindowDependencies): NotesWindow {
  const observable = createObservableState(NOT_PRESENTING, reportObserverError);
  let space = initial;
  let follower: ReturnType<typeof followPresentation> | null = null;
  let reloading = false;
  // Asked for while a reload was pending: that reload may have read the store
  // before the Edit this one is for, so another follows it.
  let reloadAgain = false;

  // The presentation this window last drew. A new one reloads the Space
  // first, so an Edit made since the last talk is drawn in this one.
  let drawnPresentation: UUID | null = null;

  /** Draw what the follower is following from the Space as this window holds it. */
  const redraw = (): void => {
    const followed = follower?.getState();
    if (followed === undefined) return;
    const view = followed.kind === 'presenting' ? notesView(space, followed.snapshot) : undefined;
    observable.publish(view === undefined ? NOT_PRESENTING : { kind: 'presenting', view });
  };

  const refresh = (): void => {
    if (reloading) {
      reloadAgain = true;
      return;
    }
    reloading = true;
    void reload()
      .then((reloaded) => {
        if (reloaded !== undefined) space = reloaded;
      })
      .catch(reportObserverError)
      .finally(() => {
        reloading = false;
        if (reloadAgain) {
          reloadAgain = false;
          refresh();
        } else redraw();
      });
  };

  const show = (followed: FollowedPresentation): void => {
    if (followed.kind === 'not-presenting') {
      observable.publish(NOT_PRESENTING);
      return;
    }
    if (followed.snapshot.presentationId !== drawnPresentation) {
      drawnPresentation = followed.snapshot.presentationId;
      refresh();
      return;
    }
    const view = notesView(space, followed.snapshot);
    if (view === undefined) refresh();
    else if (!reloading) observable.publish({ kind: 'presenting', view });
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    advance: () => follower?.advance(),
    retreat: () => follower?.retreat(),
    selectBranch: (delta) => follower?.selectBranch(delta),
    connect: () => {
      const channel = links.open(spaceId);
      const following = followPresentation(channel, links.presence, reportObserverError);
      follower = following;
      const stopShowing = following.subscribe(() => show(following.getState()));
      const stopFollowing = following.connect();
      return () => {
        stopFollowing();
        stopShowing();
        channel.close();
        follower = null;
      };
    },
  };
}
