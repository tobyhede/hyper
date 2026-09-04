/**
 * The entity-actions menu on a **Card rail** — the one surface the application
 * still cannot reach. See `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md`.
 *
 * **Review, not stable**, and only this half of it is. The Sidebar half moved
 * out: production supplies `entityActions` now, so the real menu is drawn by
 * the real Sidebar in the stable `Space/Space` stories, and it carries the ADR
 * 0052 parity claims a production-reachable surface owes. A second Sidebar
 * story here would have been a copy of that one, free to disagree with it.
 *
 * The rail stays a review surface because `CardNode` still does not pass
 * `entityActions` through, so no Card on a canvas opens this menu. What the
 * commands *are*, however, is no longer invented here: they come from
 * production's own `spaceEntityActions`, so the rail cannot advertise a command
 * the application does not have. Copying is replaced by a line in the
 * on-screen log so the interaction can be judged without side effects.
 */
import type { Story } from '@ladle/react';
import { useRef, useState } from 'react';
import { productDestinationPath } from '@project/http';
import { CanvasCard, cn, type CanvasCardState } from '@project/ui';
import { cardSizeVars } from '#src/card';
import { spaceEntityActions } from '#src/entity-actions';
import { authoredSpace } from '../support/spaces';

export default { title: 'Review/Link Actions' };

/** What the reviewer sees in place of a clipboard write. */
interface Logged {
  readonly id: number;
  readonly line: string;
}

/**
 * The recorder every command reports through.
 *
 * One shared `useRef` counter rather than the log's own length, because two
 * entries added in the same tick off a stale length collide on their key.
 */
function useActivityLog() {
  const [log, setLog] = useState<readonly Logged[]>([]);
  const nextId = useRef(0);
  return {
    log,
    record: (line: string) => {
      nextId.current += 1;
      const entry = { id: nextId.current, line };
      setLog((current) => [entry, ...current].slice(0, 5));
    },
  };
}

/** Where the reviewer reads what a command would have done. */
function ActivityLog({ log, className }: { readonly log: readonly Logged[]; className?: string }) {
  return (
    <div
      className={cn(
        'w-80 rounded-md border bg-background/95 p-3 font-mono text-[11px] shadow-sm',
        className,
      )}
    >
      <p className="mb-1 font-sans text-xs font-semibold text-muted-foreground">Last actions</p>
      {log.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet — try a Card's actions.</p>
      ) : (
        <ul className="grid gap-1">
          {log.map((entry) => (
            <li key={entry.id}>{entry.line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrototypeBanner({ children }: { readonly children: string }) {
  return (
    <div className="bg-amber-400 px-3 py-1 text-center text-xs font-semibold text-amber-950">
      PROTOTYPE — {children} Nothing here copies.
    </div>
  );
}

/**
 * The Card's own rail carrying the menu, at four of the states a Card is drawn
 * in.
 *
 * The rail is `CanvasCard`'s, not a replica: the icon sits in the shared
 * command group ahead of Open/Close, so what a reviewer is looking at is the
 * order `[link][open-or-close]` on the real control cluster, with the real
 * roving-tabindex keyboard contract (ADR 0073) over it. Hover a Card, or Tab to
 * it and press ArrowRight, to reach the icon.
 *
 * The rail keeps the **link** glyph while a Sidebar row now draws the general
 * one: every other control here names its own command, so a generic glyph would
 * be the one saying nothing. Whether that survives is a rail decision, taken
 * when `CardNode` first supplies the actions.
 *
 * There is no Rename in this menu, because production has none to offer: a Card
 * title is renamed in place on its Front. The prototype's "Open in a new tab"
 * is gone for the same reason — the application does not implement it, and a
 * story is not the place to promise one.
 */
export const CardRail: Story = () => {
  const { log, record } = useActivityLog();
  const layout = authoredSpace.layouts[0];
  if (layout === undefined) throw new Error('CardRail fixture requires an authored Layout');
  const actions = spaceEntityActions({
    spaceId: authoredSpace.id,
    spaceTitle: authoredSpace.title,
    onCopy: (destination) => {
      record(`Copied → ${productDestinationPath(destination)}`);
      // Logging cannot fail; the item confirms as it does over a clipboard that
      // accepted the link.
      return true;
    },
    onRename: null,
    onDeleteLayout: null,
  });
  const cards = authoredSpace.cards.slice(0, 4);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        The link icon is one more control on the real Card rail, ahead of Open/Close.
      </PrototypeBanner>
      <div className="flex flex-1 flex-wrap items-start gap-6 p-6" style={cardSizeVars}>
        {cards.map((card, index) => {
          const state: CanvasCardState = index === 1 ? 'selected' : 'rest';
          return (
            <div key={card.id} className="grid gap-2">
              <p className="text-xs text-muted-foreground">card · {state}</p>
              <CanvasCard
                front={{
                  kind: 'markdown',
                  source: '',
                  open: false,
                  onOpenChange: () => 'retained',
                }}
                title={card.title}
                state={state}
                graphColor="#ffc53d"
                entityActions={actions({ kind: 'card', card, layout })}
              />
            </div>
          );
        })}
      </div>
      <ActivityLog log={log} className="m-6" />
    </div>
  );
};
CardRail.meta = { iframed: true };
