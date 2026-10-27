import type { Story } from '@ladle/react';
import { ShortcutSheet } from '#components/ShortcutSheet';
import '../support/inventory.css';

export default { title: 'Components/Keyboard Shortcuts' };

/** `?` while authoring lists the canvas's keys and Full View's, from the binding table. */
export const Authoring: Story = () => (
  <>
    <p>Press ? to show the keyboard shortcuts.</p>
    <ShortcutSheet active presenting={false} />
  </>
);
Authoring.meta = { iframed: true };

/** `?` while presenting lists the keys a presentation answers. */
export const Presenting: Story = () => (
  <>
    <p>Press ? to show the keyboard shortcuts.</p>
    <ShortcutSheet active presenting />
  </>
);
Presenting.meta = { iframed: true };
