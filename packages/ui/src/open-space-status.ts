/**
 * How a surface names an open Space that is not well.
 *
 * A module of its own since `.scratch/command-dock/issues/08`, which deleted
 * the vertical tab strip these words used to sit beside. They outlived it
 * because the Command Dock's Open Spaces menu reports the same three states
 * over the same open set, and `packages/app/src/dock-model.ts` is what spends
 * them. Leaving them in the deleted component's file would have made the one
 * live export a reason to keep a dead surface.
 *
 * The words are exported and the record is not. What a surface needs is the
 * *answer* for a state rather than the table, and a table handed out is a table
 * someone extends from the outside. Change a word here and every surface
 * reporting that state changes with it.
 */

export type OpenSpaceStatus = 'conflicted' | 'failed' | 'rejected';

const STATUS_LABELS = {
  conflicted: 'Save conflict',
  failed: 'Save failed',
  rejected: 'Save rejected',
} as const satisfies Record<OpenSpaceStatus, string>;

export const openSpaceStatusLabel = (status: OpenSpaceStatus): string => STATUS_LABELS[status];
