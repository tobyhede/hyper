/**
 * How a surface names an open Space that is not well.
 *
 * A module of its own because no one surface owns the words: the Command
 * Dock's Open Spaces menu reports these three states over the open set, and
 * `packages/app/src/dock-model.ts` is what spends them.
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
