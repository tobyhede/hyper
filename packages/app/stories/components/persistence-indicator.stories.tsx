import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  openSpaceSession,
  type CommitResult,
  type LoadedSpace,
  type SpaceBackend,
  type SpaceCommit,
} from '@project/persistence';
import { PersistenceControl } from '#components/PersistenceControl';

export default { title: 'Components/Persistence Indicator' };

const snapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  document: { version: 1, title: 'Lifecycle' },
  cards: [],
};

class DelayedCommitBackend implements SpaceBackend {
  listSpaces() {
    return Promise.resolve([]);
  }

  loadSpace(_id: UUID): Promise<LoadedSpace | undefined> {
    return Promise.resolve(undefined);
  }

  loadAggregate(): ReturnType<SpaceBackend['loadAggregate']> {
    return Promise.resolve({
      kind: 'loaded',
      aggregate: { metaSpaceId: snapshot.id, spaces: [] },
    });
  }

  async commit(request: SpaceCommit): Promise<CommitResult> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1_000));
    return {
      kind: 'committed',
      revisions: request.changes.flatMap((change) =>
        change.kind === 'delete'
          ? []
          : [
              {
                spaceId: change.spaceId,
                revision: change.kind === 'create' ? 0n : change.expectedRevision + 1n,
              },
            ],
      ),
      deletedSpaceIds: request.changes.flatMap((change) =>
        change.kind === 'delete' ? [change.spaceId] : [],
      ),
    };
  }
}

/** A real SpaceSession drives pending, acknowledgement and the quiet settled state. */
export const Lifecycle: Story = () => {
  const session = useMemo(
    () =>
      openSpaceSession(new DelayedCommitBackend(), {
        snapshot,
        revision: 0n,
        exportedRevision: null,
      }),
    [],
  );
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    session.submit(snapshot);
  }, [session]);

  return (
    <PersistenceControl
      persistence={state.persistence}
      onAcceptRemote={() => null}
      onKeepLocal={() => undefined}
    />
  );
};
