import type { Story } from '@ladle/react';
import { NotesWindowFixture } from '../support/NotesWindowFixture';

export default { title: 'Components/Notes Window' };

/**
 * The Notes window (ADR 0129), following a presentation of a talk with a
 * Presentation Notes Graph.
 *
 * Each story is a position in that one traversal, or no traversal at all.
 */

/** The welcome: two notes, top to bottom as they sit on the Map, and a fork after it. */
export const Fork: Story = () => <NotesWindowFixture />;

/** The demo: one note, and one move. */
export const OneNote: Story = () => <NotesWindowFixture advances={1} />;

/** Questions: no notes for it, and the end of the talk. */
export const End: Story = () => <NotesWindowFixture advances={2} />;

/** Nothing presenting this Space, so nothing to follow. */
export const NotPresenting: Story = () => <NotesWindowFixture presenting={false} />;
