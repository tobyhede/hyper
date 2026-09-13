/**
 * The entity-actions menu on a **Thing rail** — the one surface the application
 * still cannot reach. See `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md`.
 *
 * **Review, not stable**, and only this half of it is. The Sidebar half moved
 * out: production supplies `entityActions` now, so the real menu is drawn by
 * the real Sidebar in the stable `Space/Space` stories, and it carries the ADR
 * 0052 parity claims a production-reachable surface owes. A second Sidebar
 * story here would have been a copy of that one, free to disagree with it.
 *
 * The rail stays a review surface because `ThingNode` still does not pass
 * `entityActions` through, so no Thing on a canvas opens this menu. What the
 * commands *are*, however, is no longer invented here: they come from
 * production's own `spaceEntityActions`, so the rail cannot advertise a command
 * the application does not have. Copying is replaced by a line in the
 * on-screen log so the interaction can be judged without side effects.
 */
import type { Story } from '@ladle/react';
import { useRef, useState } from 'react';
import { productDestinationPath } from '@project/http';
import { CanvasThing, cn, type CanvasThingState } from '@project/ui';
import { thingSizeVars } from '#src/thing';
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
        <p className="text-muted-foreground">Nothing yet — try a Thing's actions.</p>
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
 * The Thing's own rail carrying the menu, at four of the states a Thing is drawn
 * in.
 *
 * The rail is `CanvasThing`'s, not a replica: the icon sits in the shared
 * command group ahead of Open/Close, so what a reviewer is looking at is the
 * order `[link][open-or-close]` on the real control cluster, with the real
 * roving-tabindex keyboard contract (ADR 0073) over it. Hover a Thing, or Tab to
 * it and press ArrowRight, to reach the icon.
 *
 * The rail keeps the **link** glyph while a Sidebar row now draws the general
 * one: every other control here names its own command, so a generic glyph would
 * be the one saying nothing. Whether that survives is a rail decision, taken
 * when `ThingNode` first supplies the actions.
 *
 * There is no Rename in this menu, because production has none to offer: a Thing
 * title is renamed in place on its Front. The prototype's "Open in a new tab"
 * is gone for the same reason — the application does not implement it, and a
 * story is not the place to promise one.
 */
export const ThingRail: Story = () => {
  const { log, record } = useActivityLog();
  const diagram = authoredSpace.diagrams[0];
  if (diagram === undefined) throw new Error('ThingRail fixture requires an authored Diagram');
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
    onDeleteDiagram: null,
  });
  const things = authoredSpace.things.slice(0, 4);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        The actions menu is one more control on the real Thing rail, ahead of Open/Close.
      </PrototypeBanner>
      <div className="flex flex-1 flex-wrap items-start gap-6 p-6" style={thingSizeVars}>
        {things.map((thing, index) => {
          const state: CanvasThingState = index === 1 ? 'selected' : 'rest';
          return (
            <div key={thing.id} className="grid gap-2">
              <p className="text-xs text-muted-foreground">thing · {state}</p>
              <CanvasThing
                front={{
                  kind: 'markdown',
                  source: '',
                  open: false,
                  onOpenChange: () => 'retained',
                }}
                title={thing.title}
                state={state}
                graphColor="#ffc53d"
                entityActions={actions({ kind: 'thing', thing, diagram })}
              />
            </div>
          );
        })}
      </div>
      <ActivityLog log={log} className="m-6" />
    </div>
  );
};
ThingRail.meta = { iframed: true };
