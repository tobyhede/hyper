import { createObservableState, type ObserverErrorReporter } from '@project/persistence';

/**
 * Whether the page reports that a mounted session's Edits are kept in it only
 * (ADR 0131).
 *
 * `quiet` until the reader's first Edit, because nothing can be lost before
 * one and a mounted talk at rest then looks as any session does; `reported`
 * from that Edit; `dismissed` once the reader has put the report away, which
 * lasts for the page because the fact it acknowledges does not change.
 */
export type MountedEditsNotice = 'quiet' | 'reported' | 'dismissed';

export interface MountedEdits {
  readonly getState: () => MountedEditsNotice;
  readonly subscribe: (listener: () => void) => () => void;
  /** A Space in this page has committed an Edit. */
  readonly edited: () => void;
  /** The reader has put the report away. */
  readonly dismiss: () => void;
}

/** One per page: every open Space commits to the same store in the page's memory. */
export function createMountedEdits(reportObserverError: ObserverErrorReporter): MountedEdits {
  const observable = createObservableState<MountedEditsNotice>('quiet', reportObserverError);
  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    edited: () => {
      if (observable.getState() === 'quiet') observable.publish('reported');
    },
    dismiss: () => {
      if (observable.getState() === 'reported') observable.publish('dismissed');
    },
  };
}
