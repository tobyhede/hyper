import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import { OpenCard } from '#components/OpenCard';

export default { title: 'Review/Alias Pane Unreachable States' };

const MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000103');

const markdown: Extract<Card, { kind: 'markdown' }> = {
  id: MARKDOWN_ID,
  title: 'Architecture notes',
  kind: 'markdown',
  body: 'Placement is authored, not computed.',
};

const alias: Extract<Card, { kind: 'alias' }> = {
  id: ALIAS_ID,
  title: 'Placement recap',
  kind: 'alias',
  target: MARKDOWN_ID,
};

/** Review-only until the real application can have no eligible Alias Target. */
export const Empty: Story = () => (
  <OpenCard
    through={alias}
    occurrence={{ targets: [], onEdit: () => null }}
    onCancel={() => undefined}
  />
);
Empty.meta = { iframed: true };

/** Review-only until the real application can invalidate a Target while this editor remains open. */
export const TargetRefused: Story = () => (
  <OpenCard
    through={alias}
    occurrence={{
      targets: [markdown],
      onEdit: () => ({ code: 'alias-target-not-found', targetId: MARKDOWN_ID }),
    }}
    onCancel={() => undefined}
  />
);
TargetRefused.meta = { iframed: true };
