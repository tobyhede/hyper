/**
 * The entity-actions menu on a **Resource rail**, several Resources side by
 * side. See `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md`
 * (obsolete) for where the menu came from.
 *
 * **Review, not stable.** The menu is production-reachable: `ResourceNode`
 * passes `entityActions` through, fed by `canvas-resource-decoration.ts` from
 * `spaceEntityActions`, so every Resource on the canvas opens it. What this
 * sheet lacks is an ADR 0052 parity claim — the rail's Copy link commands were
 * left unclaimed when the Sidebar's claims were retired (`parity-claims.ts`,
 * the Command Dock block), so this stays in `stories/review` until the sheet
 * earns one or `components/resource.stories.tsx` takes it over. The commands
 * are production's own `spaceEntityActions`, so the rail cannot advertise a
 * command the application does not have; copying is replaced by a line in the
 * on-screen log so the interaction can be judged without side effects.
 */
import type { Story } from '@ladle/react';
import { useRef, useState } from 'react';
import { productDestinationPath } from '@project/http';
import { CanvasResource, cn, type CanvasResourceState } from '@project/ui';
import { resourceSizeVars } from '#src/resource';
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
        <p className="text-muted-foreground">Nothing yet — try a Resource's actions.</p>
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
 * Four Resources' own rails carrying the menu, the second one selected and the
 * rest at rest.
 *
 * The rail is `CanvasResource`'s, not a replica: the trigger sits in the shared
 * command group ahead of Open/Close, drawing the general `EntityActionsIcon`,
 * with the real roving-tabindex keyboard contract (ADR 0073) over it. Hover a
 * Resource, or Tab to it and press ArrowRight, to reach the trigger.
 *
 * There is no Rename in this menu, because production has none to offer: a Resource
 * title is renamed in place on its Front. "Open in new tab" is a Space Resource
 * command in production (`spaceEntityActions`); this review story still
 * records copies only.
 */
export const ResourceRail: Story = () => {
  const { log, record } = useActivityLog();
  const map = authoredSpace.maps[0];
  if (map === undefined) throw new Error('ResourceRail fixture requires an authored Map');
  const actions = spaceEntityActions({
    spaceId: authoredSpace.id,
    spaceTitle: authoredSpace.title,
    onCopy: (destination) => {
      record(`Copied → ${productDestinationPath(destination)}`);
      // Logging cannot fail; the item confirms as it does over a clipboard that
      // accepted the link.
      return true;
    },
    onOpenIndependently: null,
    onRename: null,
    onDeleteMap: null,
  });
  const resources = authoredSpace.resources.slice(0, 4);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        The actions menu is one more control on the real Resource rail, ahead of Open/Close.
      </PrototypeBanner>
      <div className="flex flex-1 flex-wrap items-start gap-6 p-6" style={resourceSizeVars}>
        {resources.map((resource, index) => {
          const state: CanvasResourceState = index === 1 ? 'selected' : 'rest';
          return (
            <div key={resource.id} className="grid gap-2">
              <p className="text-xs text-muted-foreground">resource · {state}</p>
              <CanvasResource
                front={{
                  kind: 'markdown',
                  source: '',
                  open: false,
                  onOpenChange: () => 'retained',
                }}
                title={resource.title}
                state={state}
                graphColor="#ffc53d"
                entityActions={actions({ kind: 'resource', resource, map })}
              />
            </div>
          );
        })}
      </div>
      <ActivityLog log={log} className="m-6" />
    </div>
  );
};
ResourceRail.meta = { iframed: true };
