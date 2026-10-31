import { useState } from 'react';
import type { Story } from '@ladle/react';
import { PlacementFailure } from '#components/PlacementFailure';
import { PlacementPending } from '#components/PlacementPending';
import { StartupFailure } from '#components/StartupFailure';
import { StartupPending } from '#components/StartupPending';
import { SpaceAppFailureView } from '#components/SpaceAppFailureView';
import { MountedEditsNotice } from '#components/ShellNotice';

export default { title: 'Components/Operational Feedback' };

/** What the whole app draws from first paint until the opened Space arrives. */
export const Starting: Story = () => <StartupPending />;

/** What the whole app renders when it cannot start at all. */
export const Startup: Story = () => (
  <StartupFailure message="Space document version 2 is not supported; this build reads version 1" />
);

/** What `SpaceAppFailure`'s error boundary renders when the mounted app throws. */
export const SpaceApp: Story = () => (
  <SpaceAppFailureView message="Graph names an absent resource 00000000-0000-4000-8000-000000000005" />
);

/** The canvas when no strategy produced positions for the active Map. */
export const Placement: Story = () => (
  <PlacementFailure error={new Error('No position for Resource A')} />
);

/** The canvas while a strategy is still arranging Resources. */
export const Arranging: Story = () => <PlacementPending />;

/** What a mounted session reports once the reader has made an Edit, until put away. */
export const MountedEdits: Story = () => {
  const [shown, setShown] = useState(true);
  return shown ? <MountedEditsNotice onDismiss={() => setShown(false)} /> : null;
};
