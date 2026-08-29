import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import { PlacementFailure } from '#components/PlacementFailure';
import { PlacementPending } from '#components/PlacementPending';
import { StartupFailure } from '#components/StartupFailure';
import { SpaceAppFailureView } from '#components/SpaceAppFailureView';
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
    }}
    remoteRefusal="The remote space is invalid and was not accepted."
  />
);
SaveConflict.meta = { iframed: true };

/** What the whole app renders when it cannot start at all. */
export const Startup: Story = () => (
  <StartupFailure message="Space document version 2 is not supported; this build reads version 1" />
);

/** What `SpaceAppFailure`'s error boundary renders when the mounted app throws. */
export const SpaceApp: Story = () => (
  <SpaceAppFailureView message="Graph names an absent card 00000000-0000-4000-8000-000000000005" />
);

/** The canvas when no strategy produced positions for the active Layout. */
export const Placement: Story = () => (
  <PlacementFailure error={new Error('No position for Card A')} />
);

/** The canvas while a strategy is still arranging Cards. */
export const Arranging: Story = () => <PlacementPending />;
