import type { Story } from '@ladle/react';
import { PresentingChromeFixture } from '../support/PresentingChromeFixture';
import { deepDiveSpace } from '../support/spaces';

export default { title: 'Components/Presenting Chrome' };

/**
 * The presenter's controls, at the four shapes a traversal actually takes.
 *
 * Zero, one and many outgoing Edges are one mechanism (ADR 0024), so these are
 * four positions in one Traversal rather than four modes: a one-member choice,
 * a fork, the end of the Graph, and the same fork in a region too narrow to hold
 * it in a row. Every one of them is real Navigation over a purpose-built Space —
 * `present()` and, where a story has to be somewhere a Graph cannot be authored
 * into, `advance()`.
 */

/** A line: the degenerate fork, and the shape most talks are. */
export const Line: Story = () => <PresentingChromeFixture />;

/** Four Edges out of one Card, the longest of them well past what the row can hold. */
export const Fork: Story = () => <PresentingChromeFixture space={deepDiveSpace} />;

/**
 * The end of the Graph, two moves in, with the way back still open.
 *
 * A sink cannot be the Card a traversal begins at — every Card a Graph can start
 * from has an Edge leaving it — so this is where the traversal arrives rather than
 * where it opens.
 */
export const Sink: Story = () => <PresentingChromeFixture advances={2} />;

/** The fork again, in a region narrow enough that the choices take their own row. */
export const Narrow: Story = () => <PresentingChromeFixture space={deepDiveSpace} width="24rem" />;
