import { useState } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import { OpenCard } from '#components/OpenCard';

export default { title: 'Components/Card and Alias Panes' };

const MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000103');

const markdown: Extract<Card, { kind: 'markdown' }> = {
  id: MARKDOWN_ID,
  title: 'Architecture notes',
  kind: 'markdown',
  body: `## Placement

Placement is authored, not computed. A Layout owns an explicitly positioned subset of Cards.

## Strategies

No strategy is privileged. Grid, sorts, trees, clusters, and ELK are choices over the same contract.

## Presentation

Opening authors one Card in place. Presenting traverses the Active Graph.`,
};

const alias: Extract<Card, { kind: 'alias' }> = {
  id: ALIAS_ID,
  title: 'Placement recap',
  kind: 'alias',
  target: MARKDOWN_ID,
};

/** Long content, local validation, atomic completion and dismissal through the production pane. */
export const Markdown: Story = () => {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('No edit completed.');

  return open ? (
    <OpenCard
      card={markdown}
      onComplete={(card) => {
        setMessage(`Completed ${card.title}.`);
        return null;
      }}
      onCancel={() => setOpen(false)}
    />
  ) : (
    <p>{message}</p>
  );
};
Markdown.meta = { iframed: true };

/** The production Alias metadata editor with its current Target available. */
export const Alias: Story = () => {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('No edit completed.');

  return open ? (
    <OpenCard
      through={alias}
      occurrence={{
        targets: [markdown],
        onEdit: ({ title }) => {
          setMessage(`Completed ${title}.`);
          return null;
        },
      }}
      onCancel={() => setOpen(false)}
    />
  ) : (
    <p>{message}</p>
  );
};
Alias.meta = { iframed: true };
