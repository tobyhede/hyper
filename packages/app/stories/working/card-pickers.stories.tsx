import { useState } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card, type CardId } from '@project/core';
import { CardCombobox, WorkingCardSearchCombobox } from '@project/ui';
import { CardPicker } from '#components/CardPicker';

export default { title: 'Working/Card Pickers' };

const cards: readonly Card[] = [
  {
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000201'),
    title: 'Architecture notes',
    kind: 'markdown',
    body: 'Placement is authored, not computed.',
  },
  {
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000202'),
    title: 'Graph traversal',
    kind: 'markdown',
    body: 'Traversal follows the Active Graph.',
  },
  {
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000203'),
    title: 'Placement recap',
    kind: 'alias',
    target: uuidSchema.parse('00000000-0000-4000-8000-000000000201'),
  },
];

const choices = cards.map(({ id, title }) => ({ id, title }));

function PickerExample({
  name,
  note,
  children,
  selected,
}: {
  readonly name: string;
  readonly note: string;
  readonly children: React.ReactNode;
  readonly selected: CardId | null;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{name}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </header>
      {children}
      <p className="mt-auto text-xs text-muted-foreground">
        Selected: {cards.find((card) => card.id === selected)?.title ?? 'None'}
      </p>
    </section>
  );
}

/** Compare the two current presentations with the donor branch's improved one-input picker. */
export const Comparison: Story = () => {
  const [collapsed, setCollapsed] = useState<CardId | null>(cards[0]?.id ?? null);
  const [inline, setInline] = useState<CardId | null>(cards[0]?.id ?? null);
  const [improved, setImproved] = useState<CardId | null>(cards[0]?.id ?? null);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Working comparison
        </p>
        <h1 className="text-2xl font-semibold">Three Card picker presentations</h1>
        <p className="text-sm text-muted-foreground">
          The donor version is the intended direction: one visible field displays the current Card
          and becomes the search input in place.
        </p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <PickerExample
          name="Current collapsed"
          note="Popover over cmdk, used by compact Edge controls."
          selected={collapsed}
        >
          <CardCombobox
            label="Target"
            choices={choices}
            value={collapsed}
            onValueChange={(id) => setCollapsed(uuidSchema.parse(id))}
          />
        </PickerExample>
        <PickerExample
          name="Current inline"
          note="Always-open cmdk list, used by Alias panes."
          selected={inline}
        >
          <CardPicker
            label="Target"
            cards={cards}
            selectedId={inline}
            initialFocus={false}
            onSelect={setInline}
            emptyMessage="No Cards are available."
          />
        </PickerExample>
        <PickerExample
          name="Improved donor"
          note="Base UI Combobox: selected value and search share one input."
          selected={improved}
        >
          <WorkingCardSearchCombobox
            label="Target"
            cards={cards}
            value={improved}
            onValueChange={(id) => setImproved(uuidSchema.parse(id))}
          />
        </PickerExample>
      </div>
    </main>
  );
};
Comparison.meta = { iframed: true };
