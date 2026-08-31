import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { CardsDrawer } from '#components/CardsDrawer';
import { PersistenceNotice } from '#components/PersistenceControl';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { composeApp } from '#src/compose-app';
import { authoredSnapshot } from '../support/spaces';

export default { title: 'Surfaces/Cards Drawer' };

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const CARDS: readonly Card[] = [
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

const LONG_CARDS: readonly Card[] = Array.from({ length: 18 }, (_, index) => ({
  id: id(String(index + 100).padStart(12, '0')),
  title: `Reference ${String(index + 1).padStart(2, '0')}`,
  kind: 'markdown' as const,
  body: '',
}));

function CardsDrawerFixture({
  cards = CARDS,
  allCards = cards,
  disabled = false,
  notice,
}: {
  readonly cards?: readonly Card[];
  readonly allCards?: readonly Card[];
  readonly disabled?: boolean;
  readonly notice?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Layout 1</span>
        <CardsDrawer
          cards={cards}
          allCards={allCards}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          onAdd={(card) => {
            setAdded((titles) => [...titles, card.title]);
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

const sparseSnapshot = (): SpaceSnapshot => {
  const sparseLayout = authoredSnapshot.document.layouts?.[1];
  if (sparseLayout === undefined) throw new Error('Cards drawer story needs its sparse Layout');
  return {
    ...authoredSnapshot,
    document: { ...authoredSnapshot.document, defaultRenderer: sparseLayout.id },
  };
};

/** The production Authoring composition behind the browser-reachable repeated-activation refusal. */
function RefusedAdd() {
  const session = useMemo(() => {
    const snapshot = sparseSnapshot();
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    return openSpaceSession(new MemorySpaceBackend([stored]), stored);
  }, []);
  const composed = useMemo(() => composeApp({ spaceSession: session }), [session]);
  useSyncExternalStore(session.subscribe, session.getState);
  const space = composed.currentSpace();
  const layout = space.lookup.layout(composed.navigation.getState().selectedRenderer)?.layout;
  const cards =
    layout === undefined
      ? []
      : space.cards.filter((card) => layout.positions[card.id] === undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start bg-background p-2 text-foreground">
      <CardsDrawer
        cards={cards}
        allCards={space.cards}
        open={open}
        onOpenChange={setOpen}
        onAdd={(card) => {
          const result = composed.authoring.complete({
            kind: 'added-card-to-layout',
            cardId: card.id,
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
 * The production Cards View with every Card kind available.
 *
 * Mounted closed, behind its own trigger and over a stand-in for the canvas it
 * feeds — the smallest boundary that owns the drawer's opening, its dismissal
 * and the fact that its overlay does not take the surface behind it away.
 */
export const AvailableCards: Story = () => {
  return <CardsDrawerFixture />;
};
AvailableCards.meta = { iframed: true };

export const Empty: Story = () => <CardsDrawerFixture cards={[]} allCards={CARDS} />;
Empty.meta = { iframed: true };

export const LongList: Story = () => <CardsDrawerFixture cards={LONG_CARDS} />;
LongList.meta = { iframed: true };

export const Disabled: Story = () => <CardsDrawerFixture disabled />;
Disabled.meta = { iframed: true };

export const Refused: Story = () => <RefusedAdd />;
Refused.meta = { iframed: true };

export const PersistenceFailure: Story = () => (
  <CardsDrawerFixture
    notice={
      <PersistenceNotice
        persistence={{
          kind: 'failed',
          failure: {
            kind: 'retryable-failure',
            code: 'network',
            message: 'The Card is local but has not been saved.',
          },
        }}
        onRetry={() => undefined}
      />
    }
  />
);
PersistenceFailure.meta = { iframed: true };
