import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Resource, type UUID } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ResourcesPopover } from '#components/ResourcesPopover';
import { PersistenceNotice } from '#components/PersistenceControl';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { composeApp } from '#src/compose-app';
import { sparseAuthoredSnapshot } from '../support/spaces';

export default { title: 'Surfaces/Resources Popover' };

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const RESOURCES: readonly Resource[] = [
  { id: id('000000000001'), title: 'API boundaries', kind: 'markdown', body: '' },
  { id: id('000000000002'), title: 'Architecture', kind: 'markdown', body: '' },
  { id: id('000000000003'), title: 'Design constraints', kind: 'markdown', body: '' },
  {
    id: id('000000000004'),
    title: 'Constraints',
    kind: 'reference',
    target: id('000000000003'),
  },
  {
    id: id('000000000005'),
    title: 'Demo flow',
    kind: 'space',
    spaceId: id('000000000010'),
    map: id('000000000011'),
    graph: id('000000000012'),
  },
];

const LONG_RESOURCES: readonly Resource[] = Array.from({ length: 18 }, (_, index) => ({
  id: id(String(index + 100).padStart(12, '0')),
  title: `Reference ${String(index + 1).padStart(2, '0')}`,
  kind: 'markdown' as const,
  body: '',
}));

/** Spaces of the Meta Space, which are not Resources and are in no Map. */
const SPACES = [
  { id: id('000000000020'), title: 'Blueprint' },
  { id: id('000000000021'), title: 'Yardstick' },
];

function ResourcesPopoverFixture({
  resources = RESOURCES,
  allResources = resources,
  disabled = false,
  notice,
  spaces,
}: {
  readonly resources?: readonly Resource[];
  readonly allResources?: readonly Resource[];
  readonly disabled?: boolean;
  readonly notice?: ReactNode;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  // A completed Add takes the Resource out of the list, which is what the
  // application does: the Resource has joined the Map, so it is no longer
  // outside it. Without that the activated row never unmounts, and every
  // claim this catalogue makes about what follows an Add — the row going,
  // the caret coming back to the filter — would hold over a row still on
  // screen and still able to keep focus itself.
  const [placed, setPlaced] = useState<readonly string[]>([]);
  const outside = resources.filter((resource) => !placed.includes(resource.id));
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Map 1</span>
        <ResourcesPopover
          resources={outside}
          allResources={allResources}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          onAdd={(resource) => {
            setAdded((titles) => [...titles, resource.title]);
            setPlaced((ids) => [...ids, resource.id]);
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
    return openSpaceSession(MemorySpaceBackend.asMeta(stored), stored);
  }, []);
  const composed = useMemo(() => composeApp({ spaceSession: session }), [session]);
  useSyncExternalStore(session.subscribe, session.getState);
  const space = composed.currentSpace();
  const map = space.lookup.map(composed.navigation.getState().selectedMapId)?.map;
  const resources =
    map === undefined
      ? []
      : space.resources.filter((resource) => map.positions[resource.id] === undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start bg-background p-2 text-foreground">
      <ResourcesPopover
        resources={resources}
        allResources={space.resources}
        open={open}
        onOpenChange={setOpen}
        onAdd={(resource) => {
          const result = composed.authoring.complete({
            kind: 'added-resource-to-map',
            resourceId: resource.id,
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
 * The production Resources View with every Resource kind available.
 *
 * Mounted closed, behind its own trigger and over a stand-in for the canvas it
 * feeds — the smallest boundary that owns the list's opening, its dismissal and
 * the fact that the surface behind it stays live. That last one is the
 * comparison's own claim restored: the list is anchored to its trigger and does
 * not close on an outside press, so dropping a Resource onto the canvas neither
 * dismisses it nor is dismissed by it
 * (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
 */
export const AvailableResources: Story = () => {
  return <ResourcesPopoverFixture />;
};
AvailableResources.meta = { iframed: true };

/**
 * The list's second source beside its first.
 *
 * A Space Resource is one authored view placed in a Map; a Space is the volume
 * such a view is a view of, offered whether or not this Space has ever pointed
 * at it (ADR 0074). The rows interleave by name because the reader is looking
 * for a name, and each carries the glyph that says which it is — the same pair
 * the filter draws.
 */
export const MetaSpaces: Story = () => <ResourcesPopoverFixture spaces={SPACES} />;
MetaSpaces.meta = { iframed: true };

export const Empty: Story = () => (
  <ResourcesPopoverFixture resources={[]} allResources={RESOURCES} />
);
Empty.meta = { iframed: true };

export const LongList: Story = () => <ResourcesPopoverFixture resources={LONG_RESOURCES} />;
LongList.meta = { iframed: true };

export const Disabled: Story = () => <ResourcesPopoverFixture disabled />;
Disabled.meta = { iframed: true };

export const Refused: Story = () => <RefusedAdd />;
Refused.meta = { iframed: true };

export const PersistenceFailure: Story = () => (
  <ResourcesPopoverFixture
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
