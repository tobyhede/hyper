import type { Story } from '@ladle/react';
import { SpaceSidebarFixture } from '../support/SpaceSidebarFixture';
import { newSpaceFixture } from '../support/spaces';

export default { title: 'Space/Space' };

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

/** The ordinary one-Card, one-Layout starting state. */
export const NewSpace: Story = () => <SpaceSidebarFixture space={newSpaceFixture} />;
NewSpace.meta = { iframed: true };

export const AddLayoutReady: Story = () => (
  <SpaceSidebarFixture
    space={newSpaceFixture}
    createLayout={{
      refusal: null,
      onCreate: () => {
        document.body.dataset['createLayout'] = 'requested';
      },
    }}
  />
);
AddLayoutReady.meta = { iframed: true };

export const Presenting: Story = () => <SpaceSidebarFixture presenting authoringDisabled />;
Presenting.meta = { iframed: true };
