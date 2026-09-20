import { StatusBusy } from '@project/ui';

/** The canvas while a strategy is still arranging Resources. */
export function PlacementPending() {
  return <StatusBusy className="h-full" label="Arranging…" />;
}
