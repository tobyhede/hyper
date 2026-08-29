import type { Story } from '@ladle/react';
import { OpenSpaceSidebarsFixture } from '../support/OpenSpaceSidebarsFixture';

export default { title: 'Space/Multiple Spaces' };

/** Production components ahead of the application path that issue 11 owns. */
export const Sidebars: Story = () => <OpenSpaceSidebarsFixture />;
Sidebars.meta = { iframed: true };
