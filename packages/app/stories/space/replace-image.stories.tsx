/**
 * Replacing an Image Resource's image, over the production application (ADR
 * 0106): Replace on the Resource's toolbar, and the failed-image state's own
 * Replace, both swap the content for one upload target, whose Upload button,
 * drop and URL field each complete one Edit.
 *
 * `iframed` is written out because Ladle reads each `meta` statically.
 */
import type { Story } from '@ladle/react';
import { ReplaceImageFixture } from '../support/ReplaceImageFixture';

export default { title: 'Space/Replace Image' };

/** A Closed Image Resource, and an Open one whose picture does not load. */
export const Default: Story = () => <ReplaceImageFixture />;
Default.meta = { iframed: true };
