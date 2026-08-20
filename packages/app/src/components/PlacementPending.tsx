import { StatusBusy } from '@project/ui';

/** The canvas while a strategy is still arranging Cards. */
export function PlacementPending() {
  return <StatusBusy className="h-full" label="Arranging…" />;
}
