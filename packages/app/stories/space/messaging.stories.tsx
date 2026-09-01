import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import { RetryableSpaceSidebarFixture, SpaceSidebarFixture } from '../support/SpaceSidebarFixture';

export default { title: 'Space/Messaging' };

export const Saving: Story = () => <SpaceSidebarFixture persistence={{ kind: 'pending' }} />;
Saving.meta = { iframed: true };

export const SaveFailed: Story = () => <RetryableSpaceSidebarFixture />;
SaveFailed.meta = { iframed: true };

export const SaveRejected: Story = () => (
  <SpaceSidebarFixture
    persistence={{
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
    }}
  />
);
SaveRejected.meta = { iframed: true };

export const SaveConflict: Story = () => (
  <SpaceSidebarFixture
    persistence={{
      kind: 'conflicted',
      current: {
        snapshot: {
          id: uuidSchema.parse('00000000-0000-4000-8000-000000000005'),
          document: { version: 1, title: 'Remote space' },
          cards: [],
        },
        revision: 5n,
        exportedRevision: null,
      },
      baseline: undefined,
    }}
    remoteRefusal="The remote space is invalid and was not accepted."
  />
);
SaveConflict.meta = { iframed: true };
