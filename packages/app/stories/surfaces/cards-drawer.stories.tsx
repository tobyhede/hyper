import { useState } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import { CardsDrawer } from '#components/CardsDrawer';

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

/**
 * The production Cards View with every Card kind available.
 *
 * Mounted closed, behind its own trigger and over a stand-in for the canvas it
 * feeds — the smallest boundary that owns the drawer's opening, its dismissal
 * and the fact that its overlay does not take the surface behind it away.
 */
export const AvailableCards: Story = () => {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b p-2">
        <span className="text-sm font-medium">Layout 1</span>
        <CardsDrawer
          cards={CARDS}
          allCards={CARDS}
          open={open}
          onOpenChange={setOpen}
          onAdd={(card) => setAdded((titles) => [...titles, card.title])}
          onDragStart={() => undefined}
        />
      </header>
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
};
AvailableCards.meta = { iframed: true };
