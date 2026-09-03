import type { Story } from '@ladle/react';
import { ApplicationChromeFixture } from '../support/ApplicationChromeFixture';

export default { title: 'Review/Application Chrome' };

/**
 * The reusable Ladle harness by itself: real AppShell, SpaceSidebar,
 * selected-Layout header and React Flow adapter canvas.
 */
export const Default: Story = () => <ApplicationChromeFixture />;
Default.meta = { iframed: true };
