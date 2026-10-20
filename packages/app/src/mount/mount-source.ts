import type { HistoryApi } from '../browser-location';
import { sourceParameter, withSource } from '../source-parameter';
import {
  formatGitHubLocation,
  parseGitHubLocation,
  type GitHubLocation,
  type MalformedGitHubLocation,
  type ResolvedGitHubLocation,
} from './github-location';

/** Where a mounted page gets its GitHub location, or that it must ask for one (ADR 0130). */
export type MountSource =
  | {
      readonly kind: 'mount';
      readonly location: GitHubLocation;
      readonly from: 'parameter' | 'default';
    }
  | {
      readonly kind: 'ask';
      /** Why the location given could not be read, or `null` when none was given. */
      readonly failure: MalformedGitHubLocation | null;
    };

/**
 * The location a mounted page reads: the `source` parameter, else the
 * build-time default, else none, and the page asks.
 *
 * A parameter that does not read is asked about rather than passed over for the
 * default, because it is what the reader followed and the default is not.
 */
export const resolveMountSource = (
  source: string | null,
  buildDefault: string | undefined,
): MountSource => {
  const given = source ?? buildDefault;
  if (given === undefined) return { kind: 'ask', failure: null };
  const parsed = parseGitHubLocation(given);
  if (!parsed.ok) return { kind: 'ask', failure: parsed.failure };
  return {
    kind: 'mount',
    location: parsed.location,
    from: source === null ? 'default' : 'parameter',
  };
};

/**
 * Write the complete resolved location a mount read into `source`, replacing
 * the current entry, and only when the address does not already name it.
 *
 * Called after every successful mount, whichever way the location came, so a
 * reload, a copied link and the Notes window read the same commit after the
 * deployment default moves on. Takes the session's one {@link HistoryApi}, so
 * the native adapter keeps numbering the entry it replaces. Answers whether it
 * wrote.
 */
export const pinSource = (
  history: Pick<HistoryApi, 'href' | 'pathname' | 'replace'>,
  resolved: ResolvedGitHubLocation,
): boolean => {
  const pinned = formatGitHubLocation(resolved);
  if (sourceParameter(history.href()) === pinned) return false;
  history.replace(withSource(history.pathname(), pinned));
  return true;
};
