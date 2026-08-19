import { useState } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card, type CardId } from '@project/core';
import { NewAlias } from '#components/NewAlias';
import { OpenCard } from '#components/OpenCard';

export default { title: 'Components/Card and Alias Panes' };

const MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
const OTHER_MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000102');
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

const otherMarkdown: Extract<Card, { kind: 'markdown' }> = {
  id: OTHER_MARKDOWN_ID,
  title: 'Graph traversal',
  kind: 'markdown',
  body: 'Traversal follows the Active Graph.',
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

/** The production Alias form with no eligible Target choices. */
export const AliasEmpty: Story = () => (
  <OpenCard
    through={alias}
    occurrence={{ targets: [], onEdit: () => null }}
    onCancel={() => undefined}
  />
);
AliasEmpty.meta = { iframed: true };

/** A domain refusal keeps both Alias metadata fields pending in the production form. */
export const AliasRefusal: Story = () => (
  <OpenCard
    through={alias}
    occurrence={{
      targets: [markdown, otherMarkdown],
      onEdit: () => 'This Alias could not be completed.',
    }}
    onCancel={() => undefined}
  />
);
AliasRefusal.meta = { iframed: true };

/** Alias creation starts at its terminal Target choice even when none is available. */
export const NewAliasEmpty: Story = () => (
  <NewAlias
    targets={[]}
    refusal={null}
    onCreate={() => undefined}
    onCancel={() => undefined}
    onRefusalStale={() => undefined}
  />
);
NewAliasEmpty.meta = { iframed: true };

/** A refused terminal choice stays local until either creation field changes. */
export const NewAliasRefusal: Story = () => {
  const [refusal, setRefusal] = useState<string | null>(
    'The Alias could not be placed in this Layout.',
  );

  return (
    <NewAlias
      targets={[markdown, otherMarkdown]}
      refusal={refusal}
      onCreate={(_target: CardId, _title: string) =>
        setRefusal('The Alias could not be placed in this Layout.')
      }
      onCancel={() => undefined}
      onRefusalStale={() => setRefusal(null)}
    />
  );
};
NewAliasRefusal.meta = { iframed: true };
