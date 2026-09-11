import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Thing } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ThingsDrawer } from '#components/ThingsDrawer';
import { PersistenceNotice } from '#components/PersistenceControl';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { composeApp } from '#src/compose-app';
import { sparseAuthoredSnapshot } from '../support/spaces';

export default { title: 'Surfaces/Things Drawer' };

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const THINGS: readonly Thing[] = [
  { id: id('000000000001'), title: 'API boundaries', kind: 'markdown', body: '' },
  { id: id('000000000002'), title: 'Architecture', kind: 'markdown', body: '' },
  { id: id('000000000003'), title: 'Design constraints', kind: 'markdown', body: '' },
  {
    id: id('000000000004'),
    title: 'Constraints',
    kind: 'alias',
    target: id('000000000003'),
  },
  { id: id('000000000005'), title: 'Demo flow', kind: 'space', spaceId: id('000000000010') },
];

const LONG_THINGS: readonly Thing[] = Array.from({ length: 18 }, (_, index) => ({
  id: id(String(index + 100).padStart(12, '0')),
  title: `Reference ${String(index + 1).padStart(2, '0')}`,
  kind: 'markdown' as const,
  body: '',
}));

function ThingsDrawerFixture({
  things = THINGS,
  allThings = things,
  disabled = false,
  notice,
}: {
  readonly things?: readonly Thing[];
  readonly allThings?: readonly Thing[];
  readonly disabled?: boolean;
  readonly notice?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Diagram 1</span>
        <ThingsDrawer
          things={things}
          allThings={allThings}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          onAdd={(thing) => {
            setAdded((titles) => [...titles, thing.title]);
            return null;
          }}
          onDragStart={() => undefined}
        />
      </header>
      {notice}
      <button
        type="button"
        className="flex-1 text-sm text-muted-foreground"
        onClick={() => setAdded((titles) => [...titles, 'canvas'])}
      >
        The canvas behind it
      </button>
      <p className="shrink-0 border-t p-2 text-sm">Added: {added.join(', ')}</p>
    </div>
  );
}

/** The production Authoring composition behind the browser-reachable repeated-activation refusal. */
function RefusedAdd() {
  const session = useMemo(() => {
    const stored = { snapshot: sparseAuthoredSnapshot, revision: 0n, exportedRevision: null };
    return openSpaceSession(new MemorySpaceBackend([stored]), stored);
  }, []);
  const composed = useMemo(() => composeApp({ spaceSession: session }), [session]);
  useSyncExternalStore(session.subscribe, session.getState);
  const space = composed.currentSpace();
  const diagram = space.lookup.diagram(composed.navigation.getState().selectedDiagramId)?.diagram;
  const things =
    diagram === undefined
      ? []
      : space.things.filter((thing) => diagram.positions[thing.id] === undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start bg-background p-2 text-foreground">
      <ThingsDrawer
        things={things}
        allThings={space.things}
        open={open}
        onOpenChange={setOpen}
        onAdd={(thing) => {
          const result = composed.authoring.complete({
            kind: 'added-thing-to-diagram',
            thingId: thing.id,
            anchor: { x: 0, y: 0 },
          });
          return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
        }}
        onDragStart={() => undefined}
      />
    </div>
  );
}

/**
 * The production Things View with every Thing kind available.
 *
 * Mounted closed, behind its own trigger and over a stand-in for the canvas it
 * feeds — the smallest boundary that owns the drawer's opening, its dismissal
 * and the fact that its overlay does not take the surface behind it away.
 */
export const AvailableThings: Story = () => {
  return <ThingsDrawerFixture />;
};
AvailableThings.meta = { iframed: true };

export const Empty: Story = () => <ThingsDrawerFixture things={[]} allThings={THINGS} />;
Empty.meta = { iframed: true };

export const LongList: Story = () => <ThingsDrawerFixture things={LONG_THINGS} />;
LongList.meta = { iframed: true };

export const Disabled: Story = () => <ThingsDrawerFixture disabled />;
Disabled.meta = { iframed: true };

export const Refused: Story = () => <RefusedAdd />;
Refused.meta = { iframed: true };

export const PersistenceFailure: Story = () => (
  <ThingsDrawerFixture
    notice={
      <PersistenceNotice
        persistence={{
          kind: 'failed',
          failure: {
            kind: 'retryable-failure',
            code: 'network',
            // Deliberately the transport's own voice. `PersistenceNotice`
            // describes the code, so what this story proves is that this
            // sentence is the one the author does *not* read (ADR 0057).
            message: 'Failed to fetch',
          },
        }}
        onRetry={() => undefined}
      />
    }
  />
);
PersistenceFailure.meta = { iframed: true };
