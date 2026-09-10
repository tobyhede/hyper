import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import { RetryableSpaceSidebarFixture, SpaceSidebarFixture } from '../support/SpaceSidebarFixture';

const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

/**
 * Hoisted, not inlined in the story body.
 *
 * `PersistenceControl` separates two rejections by the identity of the failure
 * the session published, which is what lets it draw a second failure equal by
 * value to a dismissed one. A literal inside the story mints a fresh object on
 * every render, so a Ladle theme or width toggle would read as a new rejection
 * and re-raise a dialog the author had dismissed.
 */
const REJECTED = {
  kind: 'rejected',
  failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
} as const;

export default { title: 'Space/Messaging' };

export const Saving: Story = () => <SpaceSidebarFixture persistence={{ kind: 'pending' }} />;
Saving.meta = { iframed: true };

export const SaveFailed: Story = () => <RetryableSpaceSidebarFixture />;
SaveFailed.meta = { iframed: true };

export const SaveRejected: Story = () => <SpaceSidebarFixture persistence={REJECTED} />;
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
    remoteRefusal={{
      code: 'stored-space-invalid',
      errors: [
        {
          kind: 'graph-edge-missing-card',
          ref: MISSING_CARD_ID,
          message: 'graph edge references unknown card',
        },
      ],
    }}
  />
);
SaveConflict.meta = { iframed: true };
