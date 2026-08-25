import { useState } from 'react';
import type { Story } from '@ladle/react';
import type { CardId } from '@project/core';
import { BehaviourControls, ExpandingCanvas, type CanvasBehaviour } from './expanding-cards';
import { CatalogueSection } from '../support/Catalogue';
import { cardIds } from '../support/fixture';
import '../support/inventory.css';

/**
 * Opening a Card as that Card Expanding, on the canvas it already lives on.
 *
 * The direction is settled and recorded as **ADR 0064**: opening a Card expands
 * it in place, expansion is a Layout property, and the Cards `+x` and `+y` of an
 * Expanded Card take its growth on their own position.
 *
 * **This is the application's canvas**, not a drawing of it — the catalogue
 * fixture Space through `loadSpace`, the production renderer, placement,
 * projection, node and Edge components. Every Card is the shipped `CanvasCard`;
 * expanding one changes its rect and fills the slot below its title, and changes
 * nothing else about it. `Review/` because ADR 0064 is decided and not yet built,
 * so this carries no parity claim and asserts nothing (ADR 0052) — what the
 * production stories will claim arrives with the production surfaces.
 *
 * Three behaviours are decided and off, so the canvas keeps one rule each time.
 * **Scroll is not contained** — the wheel is the canvas's everywhere, so no
 * Expanded Card is a hole to wheel-pan across, and a Card showing less than its
 * source is resized rather than scrolled. **No 16:9** — an Expanded Card is
 * whatever box the author drew; the collapsed Card keeps the silhouette that
 * predicts what an audience sees. **No camera follow** — the Card grows where the
 * author put it and they travel to it.
 *
 * One switch is left, because it is the one thing worth still feeling both ways:
 *
 *  - **push neighbours.** Expanding collides: the Layout's positions were
 *    authored for `260x146` boxes, and a Card that grows to `560x420` is over its
 *    neighbours at once. On, every Card `+x` and `+y` of it takes that growth on
 *    its own position — *derived* from which Cards are Expanded, so the authored
 *    Layout never changes and collapsing puts everything back exactly. Off, they
 *    overlap and the author sorts it out.
 *
 * Expand a Card from the Edit control on its rail — nothing a pointer does to
 * the body of a collapsed Card opens it, which is ADR 0036 unchanged. **The
 * Alias Card offers no control**: ADR 0064 leaves the Alias Expanded front open,
 * so nothing fills its slot and it has no Expanded state to enter.
 *
 * **Editing is one click, on both fields.** A Card's title renames through the
 * production `CanvasCard`'s own control; an Expanded Card renders its Markdown
 * through the same parser and sanitiser as presentation mode, and activating it
 * swaps that display for the source editor. Enter completes a title and Escape
 * abandons it; `Mod-Enter` completes the source, Escape abandons it, and clicking
 * away completes either. One caret
 * at a time, canvas-wide — so "Expanded" is what the Layout authored and "being
 * edited" is a gesture.
 *
 * Select an Expanded Card to resize it with React Flow's own `NodeResizer`. The
 * panel at the bottom-left prints what a Layout would have to store, and what the
 * push is adding to it.
 */

export default { title: 'Review/Expanding Cards' };

function Stage({
  title,
  note,
  initiallyExpanded = [],
}: {
  readonly title: string;
  readonly note: React.ReactNode;
  readonly initiallyExpanded?: readonly CardId[];
}) {
  const [behaviour, setBehaviour] = useState<CanvasBehaviour>({ pushNeighbours: true });

  return (
    <div className="inv inv-sheet inv-sheet--viewport">
      <CatalogueSection title={title} note="">
        {note}
        <BehaviourControls behaviour={behaviour} onChange={setBehaviour} />
        <div style={{ height: '68vh', minHeight: '420px' }}>
          <ExpandingCanvas behaviour={behaviour} initiallyExpanded={initiallyExpanded} />
        </div>
      </CatalogueSection>
    </div>
  );
}

/**
 * One Card at a time, which is the state the pane also serves — so it is the fair
 * comparison. Everything the pane does, without a second surface: the graph stays
 * where it was, the Card stays where it was, and its Edges stay attached to it
 * while it grows.
 */
export const ExpandOneCard: Story = () => (
  <Stage
    title="Expanding a Card"
    note={
      <p className="inv-section__note">
        Expand from the Edit control on a Card’s rail — nothing a pointer does to the body of a
        collapsed Card opens it (ADR 0036). The Card grows where it sits, its Edges stay attached at
        the anchors the strategy computed, and the canvas is still behind and around it. Click its
        title to rename it and its rendered Markdown to edit its source. Select it to resize with
        React Flow’s own <code>NodeResizer</code>.
      </p>
    }
  />
);
ExpandOneCard.meta = { iframed: true };

/**
 * The same canvas, reached by expanding two Cards — the capability a covering
 * pane forecloses by construction, and the one that earns the rest of the cost.
 *
 * Worth doing deliberately: write in one and read the other, then wheel-pan
 * straight across both. Nothing catches the wheel, which is what leaving scroll
 * uncontained bought.
 */
export const TwoOpenAtOnce: Story = () => (
  <Stage
    title="Two Cards open at once"
    initiallyExpanded={[cardIds.problem, cardIds.traversal]}
    note={
      <p className="inv-section__note">
        Expand two Cards and write in one while reading the other — the thing a modal cannot do.
        Turn <strong>push neighbours</strong> off to see the collision the authored Layout actually
        has. Then wheel-pan straight across both: the canvas keeps the wheel, and neither Card is a
        hole in it.
      </p>
    }
  />
);
TwoOpenAtOnce.meta = { iframed: true };
