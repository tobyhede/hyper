import type { ReactNode } from 'react';
import { CircleAlertIcon } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/tabs';

export type OpenSpaceStatus = 'conflicted' | 'failed' | 'rejected';

export interface OpenSpaceEntry {
  readonly id: string;
  readonly title: string;
  readonly status?: OpenSpaceStatus | undefined;
  readonly content: ReactNode;
}

export interface OpenSpacesProps {
  readonly entries: readonly OpenSpaceEntry[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}

const STATUS_LABELS = {
  conflicted: 'Save conflict',
  failed: 'Save failed',
  rejected: 'Save rejected',
} as const satisfies Record<OpenSpaceStatus, string>;

/**
 * The session's set of open Spaces beside the active Space Sidebar (ADR 0068).
 *
 * Selection belongs to the caller. This component owns the tabs interaction
 * and keeps every panel mounted so each Space's command state survives while a
 * different Space is showing.
 */
export function OpenSpaces({ entries, activeId, onSelect }: OpenSpacesProps) {
  const firstEntry = entries[0];
  if (firstEntry === undefined) return null;
  const selectedId = entries.some((entry) => entry.id === activeId) ? activeId : firstEntry.id;

  return (
    <Tabs
      orientation="vertical"
      value={selectedId}
      className="h-full w-full gap-0"
      data-testid="open-spaces"
    >
      {/* One open Space draws no entry strip — there is nothing to choose
          between. Only the strip goes: the panels stay in the same tree either
          side of that boundary, so closing the last other Space leaves the
          survivor mounted with its command state rather than remounting it. */}
      {entries.length > 1 && (
        <TabsList
          aria-label="Open Spaces"
          // `h-full` is spelled through the same variant modifier the primitive
          // sets `h-fit` with, so twMerge resolves the two rather than emitting
          // both and letting the more specific compiled selector win.
          className="w-9 shrink-0 items-stretch justify-start gap-0 overflow-y-auto rounded-none bg-transparent p-0 group-data-[orientation=vertical]/tabs:h-full"
        >
          {entries.map((entry) => (
            // No wrapper element: a `tablist` announces its size from the `tab`
            // children it owns, and anything in between leaves that unresolvable.
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              title={entry.title}
              onClick={() => onSelect(entry.id)}
              className="relative h-[120px] shrink-0 cursor-pointer overflow-hidden rounded-none border-b border-sidebar-border bg-background p-0 text-[10px] tracking-wide text-muted-foreground uppercase group-data-[orientation=vertical]/tabs:justify-center hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-sidebar data-active:font-medium data-active:text-sidebar-foreground"
            >
              <span className="max-h-full rotate-180 truncate [writing-mode:vertical-rl]">
                {entry.title}
              </span>
              {entry.status !== undefined && (
                <span
                  className="absolute top-1 right-1 text-destructive"
                  title={STATUS_LABELS[entry.status]}
                >
                  <CircleAlertIcon aria-hidden="true" />
                  <span className="sr-only">{STATUS_LABELS[entry.status]}</span>
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      <div className="min-w-0 flex-1">
        {entries.map((entry) => (
          <TabsContent key={entry.id} value={entry.id} keepMounted className="h-full">
            {entry.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
