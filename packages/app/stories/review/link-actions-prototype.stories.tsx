/**
 * One entity-actions menu — Rename, Copy link, Copy permanent link, Open in a
 * new tab — reachable two ways: a trailing icon on the entity's own row or
 * rail, and a right click anywhere on it. See
 * `.scratch/link-ux/issues/01-choose-the-link-action-pattern.md`.
 *
 * **Review, not stable.** The menu is drawn by the real `SpaceSidebar` and the
 * real `CanvasCard` here, but nothing in the application supplies their
 * `entityActions` yet, so no state below is production-reachable and no ADR
 * 0052 parity claim attaches (`stories/story-template.tsx`). What is fixture is
 * only what the commands *do*: the addresses are built by `@project/http`'s own
 * `productDestinationPath` from the fixture Space's real ids, but copying,
 * navigating and renaming are replaced by a line in the on-screen log so the
 * interaction can be judged without side effects.
 */
import type { Story } from '@ladle/react';
import { useRef, useState } from 'react';
import { productDestinationPath, type ProductDestination } from '@project/http';
import {
  CanvasCard,
  cn,
  type CanvasCardState,
  type EntityAction,
  type EntityActionGroup,
} from '@project/ui';
import { cardSizeVars } from '#src/card';
import type { SpaceEntity } from '#components/SpaceSidebar';
import { ApplicationChromeFixture } from '../support/ApplicationChromeFixture';
import { authoredSpace } from '../support/spaces';

export default { title: 'Review/Link Actions' };

/** What the reviewer sees in place of a clipboard write or a navigation. */
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

/** A copy command, built from the address the application would really copy. */
const copy = (
  id: string,
  label: string,
  description: string,
  destination: ProductDestination,
  record: (line: string) => void,
): EntityAction => ({
  id,
  label,
  description,
  confirmation: 'Copied',
  onSelect: () => record(`Copied → ${productDestinationPath(destination)}`),
});

const rename = (id: string, subject: string, record: (line: string) => void): EntityAction => ({
  id,
  label: 'Rename',
  onSelect: () => record(`Would begin renaming → ${subject}`),
});

const openInNewTab = (
  id: string,
  destination: ProductDestination,
  record: (line: string) => void,
): EntityAction => ({
  id,
  label: 'Open in new tab',
  onSelect: () => record(`Would open in a new tab → ${productDestinationPath(destination)}`),
});

/**
 * What each Sidebar entity offers.
 *
 * Three groups throughout — rename, then the addresses, then where to open —
 * so a menu's shape does not change with what the entity happens to have. A
 * command the entity lacks leaves its group shorter or empty, and an empty
 * group draws neither items nor its rule (`EntityActionsMenu`).
 *
 * A Space gets no Rename: production has no Space rename affordance today, and
 * this prototype does not invent one.
 */
function sidebarActions(
  entity: SpaceEntity,
  record: (line: string) => void,
): readonly EntityActionGroup[] {
  const spaceId = authoredSpace.id;
  if (entity.kind === 'space') {
    const destination: ProductDestination = { kind: 'space', spaceId };
    return [
      [],
      [
        copy(
          'space-link',
          'Copy link',
          `Opens ${authoredSpace.title} at the view it opens on`,
          destination,
          record,
        ),
      ],
      [openInNewTab('space-new-tab', destination, record)],
    ];
  }
  if (entity.kind === 'layout') {
    const { renderer } = entity;
    const destination: ProductDestination = {
      kind: 'layout',
      spaceId,
      layoutId: renderer.selection,
    };
    return [
      [rename('layout-rename', renderer.title, record)],
      [
        copy(
          'layout-link',
          'Copy link',
          `Opens ${renderer.title} exactly as it draws now`,
          destination,
          record,
        ),
      ],
      [openInNewTab('layout-new-tab', destination, record)],
    ];
  }
  const { graph, renderer } = entity;
  return [
    [rename('graph-rename', graph.title, record)],
    [
      copy(
        'graph-here',
        'Copy link',
        `Opens ${graph.title} inside the Layout drawing now`,
        { kind: 'layout-graph', spaceId, layoutId: renderer.selection, graphId: graph.id },
        record,
      ),
      copy(
        'graph-permanent',
        'Copy permanent link',
        `Always opens ${graph.title}, in whichever Layout draws it`,
        { kind: 'graph', spaceId, graphId: graph.id },
        record,
      ),
    ],
    [openInNewTab('graph-new-tab', { kind: 'graph', spaceId, graphId: graph.id }, record)],
  ];
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
        <p className="text-muted-foreground">Nothing yet — try a row's actions.</p>
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
      PROTOTYPE — {children} Nothing here copies, navigates or renames.
    </div>
  );
}

/**
 * The real Space Sidebar drawing the menu on every row it owns: each Space
 * View, each Graph, and the Space's own title.
 *
 * The Sidebar's existing "Copy link to …" buttons are switched off, because the
 * menu is what replaces them — showing both would put two paths to one command
 * in front of a reviewer being asked to judge one of them.
 */
export const Sidebar: Story = () => {
  const { log, record } = useActivityLog();
  return (
    <div className="flex h-screen flex-col">
      <PrototypeBanner>
        Right-click any Layout, Graph or the Space title — or press the link icon that appears on it
        — for the same menu.
      </PrototypeBanner>
      <div className="min-h-0 flex-1">
        <ApplicationChromeFixture
          entityActions={(entity) => sidebarActions(entity, record)}
          canvasOverlay={<ActivityLog log={log} className="absolute right-4 bottom-4 z-10" />}
        />
      </div>
    </div>
  );
};
Sidebar.meta = { iframed: true };

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
 * Right click is deliberately absent here. Wiring it across a Card body means
 * settling how it sits with React Flow's own pan, drag, multi-select and
 * connection handling, which the ticket leaves open — so the Card answers the
 * icon only, and the Sidebar story above is where the right click is judged.
 */
export const CardRail: Story = () => {
  const { log, record } = useActivityLog();
  const spaceId = authoredSpace.id;
  const layoutId = authoredSpace.layouts[0]?.id;
  if (layoutId === undefined) throw new Error('CardRail fixture requires an authored Layout');
  const cards = authoredSpace.cards.slice(0, 4);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        The link icon is one more control on the real Card rail, ahead of Open/Close.
      </PrototypeBanner>
      <div className="flex flex-1 flex-wrap items-start gap-6 p-6" style={cardSizeVars}>
        {cards.map((card, index) => {
          const state: CanvasCardState = index === 1 ? 'selected' : 'rest';
          const destination: ProductDestination = { kind: 'card', spaceId, cardId: card.id };
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
                entityActions={[
                  [rename(`${card.id}-rename`, card.title, record)],
                  [
                    copy(
                      `${card.id}-here`,
                      'Copy link',
                      `Opens ${card.title} inside the Layout drawing now`,
                      {
                        kind: 'layout-card',
                        spaceId,
                        layoutId,
                        cardId: card.id,
                      },
                      record,
                    ),
                    copy(
                      `${card.id}-permanent`,
                      'Copy permanent link',
                      `Always opens ${card.title} on its own, wherever it is placed`,
                      destination,
                      record,
                    ),
                  ],
                  [openInNewTab(`${card.id}-new-tab`, destination, record)],
                ]}
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
