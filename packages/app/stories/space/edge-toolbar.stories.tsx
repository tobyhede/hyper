/**
 * An Active Graph Edge's Title and toolbar, over the production application:
 * Title fitting, hover and selection reveal and each command need the whole.
 *
 * `iframed` is written out on each story because Ladle reads each `meta`
 * statically.
 */
import type { Story } from '@ladle/react';
import { EdgeToolbarFixture } from '../support/EdgeToolbarFixture';

export default { title: 'Space/Edge Toolbar' };

/** Titled and untitled Edges at rest, on a short gap and on long ones. */
export const Default: Story = () => <EdgeToolbarFixture />;
Default.meta = { iframed: true };

/**
 * A refused command under the Edge's toolbar. Reached through the production
 * operation, since the disabled eye never asks to hide a missing Title.
 */
export const Refused: Story = () => <EdgeToolbarFixture scenario="refused" />;
Refused.meta = { iframed: true };
