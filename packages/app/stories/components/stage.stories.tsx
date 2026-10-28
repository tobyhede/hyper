import type { Story } from '@ladle/react';
import { PresentingStageFixture } from '../support/PresentingStageFixture';
import { notesSpace } from '../support/spaces';

export default { title: 'Components/Stage' };

/**
 * The surface presenting draws on (ADR 0123), over real Navigation presenting a
 * line through the kinds of content it frames.
 *
 * Each story is a position in that one traversal: a Markdown Resource longer
 * than its frame and broken by a horizontal rule, a picture far larger than its
 * frame, an Ur Resource with nothing below its name, and a Markdown Resource as
 * long with no rule.
 */

/** Markdown longer than the frame, broken by a rule, which scrolls inside it. */
export const LongRead: Story = () => <PresentingStageFixture />;
LongRead.meta = { iframed: true };

/** A picture far larger than the frame, fitted inside it whole. */
export const Picture: Story = () => <PresentingStageFixture advances={1} />;
Picture.meta = { iframed: true };

/** An Ur Resource: its name alone, centred in the frame. */
export const TitleSlide: Story = () => <PresentingStageFixture advances={2} />;
TitleSlide.meta = { iframed: true };

/** Markdown longer than the frame with no rule, clipped to it rather than scrolled. */
export const Unbroken: Story = () => <PresentingStageFixture advances={3} />;
Unbroken.meta = { iframed: true };

/** A talk with a Presentation Notes Graph, for rehearsing with its notes under the Stage. */
export const RehearsalNotes: Story = () => <PresentingStageFixture space={notesSpace} />;
RehearsalNotes.meta = { iframed: true };
