import type { Story } from '@ladle/react';
import { GitHubLocationForm } from '#components/GitHubLocationForm';
import '../support/inventory.css';

export default { title: 'Components/GitHub Location Form' };

/**
 * What a mounted page with no `source` and no build-time default asks (ADR
 * 0130): a location that does not read is refused beside the field with the
 * parser's reason. Opening one that reads navigates the page, which the
 * application proof covers; here it goes nowhere.
 */
export const Asking: Story = () => <GitHubLocationForm navigate={() => undefined} failure={null} />;
