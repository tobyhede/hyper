import type { Story } from '@ladle/react';
import { PresentingStageFixture } from '../support/PresentingStageFixture';

export default { title: 'Components/Stage' };

/**
 * The surface presenting draws on (ADR 0123), over real Navigation presenting a
 * line through three kinds of content.
 *
 * Each story is a position in that one traversal: a Markdown Resource longer
 * than its frame, a picture far larger than its frame, and an Ur Resource with
 * nothing below its name.
 */

/** Markdown longer than the frame, which scrolls inside it. */
export const LongRead: Story = () => <PresentingStageFixture />;
LongRead.meta = { iframed: true };

/** A picture far larger than the frame, fitted inside it whole. */
export const Picture: Story = () => <PresentingStageFixture advances={1} />;
Picture.meta = { iframed: true };

/** An Ur Resource: its name alone, centred in the frame. */
export const TitleSlide: Story = () => <PresentingStageFixture advances={2} />;
TitleSlide.meta = { iframed: true };
