import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import { RetryableSpaceSidebarFixture, SpaceSidebarFixture } from '../support/SpaceSidebarFixture';
import { unauthoredSpace } from '../support/spaces';

export default { title: 'Components/Space Sidebar' };

/**
 * Every state is framed, and that is the primitive's doing rather than a
 * modal's.
 *
 * The Sidebar's desktop container is `fixed inset-y-0`, so it leaves any story
 * wrapper and covers the catalogue navigation beside it. Ladle's documented
 * `iframed` metadata is the answer for a design that owns its viewport, exactly
 * as it is for the two persistence dialogs below. Preview mode disables the
 * frame, so the behaviour tests still drive the component directly.
 *
 * Written out on each story rather than shared: Ladle parses `meta` statically
 * and rejects anything that is not an object literal.
 */

export const Settled: Story = () => <SpaceSidebarFixture />;
Settled.meta = { iframed: true };

/** A Space before its first Edit authors a Layout: two groups with nothing in them. */
export const Unauthored: Story = () => <SpaceSidebarFixture space={unauthoredSpace} />;
Unauthored.meta = { iframed: true };

export const Pending: Story = () => <SpaceSidebarFixture persistence={{ kind: 'pending' }} />;
Pending.meta = { iframed: true };

export const Failed: Story = () => <RetryableSpaceSidebarFixture />;
Failed.meta = { iframed: true };

export const Rejected: Story = () => (
  <SpaceSidebarFixture
    persistence={{
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
    }}
  />
);
Rejected.meta = { iframed: true };

export const Conflicted: Story = () => (
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
    }}
    remoteRefusal="The remote space is invalid and was not accepted."
  />
);
Conflicted.meta = { iframed: true };

export const Presenting: Story = () => <SpaceSidebarFixture presenting authoringDisabled />;
Presenting.meta = { iframed: true };
