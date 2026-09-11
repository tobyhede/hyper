import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Thing, type UUID } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ThingsPopover } from '#components/ThingsPopover';
import { PersistenceNotice } from '#components/PersistenceControl';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { composeApp } from '#src/compose-app';
import { sparseAuthoredSnapshot } from '../support/spaces';

export default { title: 'Surfaces/Things Popover' };

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

/** Spaces of the Meta Space, which are not Things and are in no Diagram. */
const SPACES = [
  { id: id('000000000020'), title: 'Blueprint' },
  { id: id('000000000021'), title: 'Yardstick' },
];

function ThingsPopoverFixture({
  things = THINGS,
  allThings = things,
  disabled = false,
  notice,
  spaces,
}: {
  readonly things?: readonly Thing[];
  readonly allThings?: readonly Thing[];
  readonly disabled?: boolean;
  readonly notice?: ReactNode;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Diagram 1</span>
        <ThingsPopover
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
          spaces={spaces}
          onAddSpace={(space) => {
            setAdded((titles) => [...titles, space.title]);
            return Promise.resolve(null);
          }}
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
      <ThingsPopover
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
 * feeds — the smallest boundary that owns the list's opening, its dismissal and
 * the fact that the surface behind it stays live. That last one is the
 * comparison's own claim restored: the list is anchored to its trigger and does
 * not close on an outside press, so dropping a Thing onto the canvas neither
 * dismisses it nor is dismissed by it
 * (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
 */
export const AvailableThings: Story = () => {
  return <ThingsPopoverFixture />;
};
AvailableThings.meta = { iframed: true };

/**
 * The list's second source beside its first.
 *
 * A Space Thing is one authored view placed in a Diagram; a Space is the volume
 * such a view is a view of, offered whether or not this Space has ever pointed
 * at it (ADR 0074). The rows interleave by name because the reader is looking
 * for a name, and each carries the glyph that says which it is — the same pair
 * the filter draws.
 */
export const MetaSpaces: Story = () => <ThingsPopoverFixture spaces={SPACES} />;
MetaSpaces.meta = { iframed: true };

export const Empty: Story = () => <ThingsPopoverFixture things={[]} allThings={THINGS} />;
Empty.meta = { iframed: true };

export const LongList: Story = () => <ThingsPopoverFixture things={LONG_THINGS} />;
LongList.meta = { iframed: true };

export const Disabled: Story = () => <ThingsPopoverFixture disabled />;
Disabled.meta = { iframed: true };

export const Refused: Story = () => <RefusedAdd />;
Refused.meta = { iframed: true };

export const PersistenceFailure: Story = () => (
  <ThingsPopoverFixture
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
