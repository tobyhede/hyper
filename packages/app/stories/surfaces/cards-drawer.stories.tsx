import { useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import { CardsDrawer } from '#components/CardsDrawer';
import { PersistenceNotice } from '#components/PersistenceControl';

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
  refusal = null,
  notice,
}: {
  readonly cards?: readonly Card[];
  readonly allCards?: readonly Card[];
  readonly disabled?: boolean;
  readonly refusal?: string | null;
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
            if (refusal !== null) return refusal;
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

export const Refused: Story = () => (
  <CardsDrawerFixture refusal="This Card is no longer available in this Layout." />
);
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
