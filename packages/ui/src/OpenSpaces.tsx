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
  if (entries.length === 0) return null;

  if (entries.length === 1) {
    return <div className="h-full min-w-0 flex-1">{entries[0]?.content}</div>;
  }

  return (
    <Tabs
      orientation="vertical"
      value={activeId}
      className="h-full w-full gap-0"
      data-testid="open-spaces"
    >
      <TabsList
        aria-label="Open Spaces"
        className="h-full w-9 shrink-0 items-stretch justify-start gap-0 overflow-y-auto rounded-none bg-transparent p-0"
      >
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="relative h-[120px] shrink-0 border-b border-sidebar-border"
          >
            <TabsTrigger
              value={entry.id}
              title={entry.title}
              onClick={() => onSelect(entry.id)}
              className="h-full cursor-pointer overflow-hidden rounded-none bg-background p-0 text-[10px] tracking-wide text-muted-foreground uppercase group-data-[orientation=vertical]/tabs:justify-center hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-sidebar data-active:font-medium data-active:text-sidebar-foreground"
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
          </div>
        ))}
      </TabsList>
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
