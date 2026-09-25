import { openSpaceStatusLabel, type OpenSpaceStatus } from '@project/ui';
import type { SpaceSessionState } from '@project/persistence';
import type { UUID } from '@project/core';
import type { ExitSpaceResult, ListingRow } from './open-spaces';

/**
 * The Command Dock's model: what it derives, with no React and no DOM.
 *
 * A module beside the component rather than inside it, because everything here
 * is mapping — how many rows of the listing are open and unwell, what a refused
 * Exit has to say — and every one of those is held to an answer by a
 * node-environment test (`packages/app/test/dock-*.test.ts`). Where the Dock
 * sits and how a drag moves it is `dock-placement.ts`'s. The Dock's components
 * import from here; nothing here imports them. The listing
 * itself — the tree the open set makes, and Meta's row in it — is
 * `open-spaces.ts`'s.
 */

/**
 * What a Space's row in the Open Spaces menu owes about its last commit, and nothing
 * more.
 *
 * The three states that need saying are the three `PersistenceControl` and
 * `PersistenceNotice` already draw a surface for — retryable failure, permanent
 * rejection and conflict. `settled` and `pending` answer `null`: **a save that
 * worked is not news**, and a save in flight is over before anyone reads a
 * spinner about it, so neither earns a mark on a row a reader is scanning for
 * names.
 *
 * The words are `openSpaceStatusLabel`'s rather than this module's: they live
 * in `packages/ui/src/open-space-status.ts` and {@link unwellReport} below is
 * what spends them — the Open Spaces menu draws what that answers. They stay in
 * `@project/ui` rather than moving here because a second vocabulary for one
 * state is how a reader learns that "Save failed" and "Changes not saved" are
 * two different resources, and that risk returns with the next surface that
 * reports an unwell Space.
 *
 * **A total record and not a chain of `if`s**, which is the difference between
 * a state this surface has decided about and a state it has never heard of. A
 * chain answers `null` for anything it does not name, so a new persistence arm
 * would compile, draw nothing, and report nothing — the row would say a Space
 * is fine because the code had not been taught otherwise. Keyed on the
 * discriminant and held to both unions at once,
 * it is a compile error instead, and the two unions cannot drift apart in
 * silence either.
 */
const UNWELL_STATUS = {
  settled: null,
  pending: null,
  failed: 'failed',
  rejected: 'rejected',
  // An aggregate refusal is its own persistence state, but
  // this row reports the same word a permanent rejection does: both mean "the
  // server declined this Space's last commit, and only a further Edit
  // recovers it," which is exactly what `OpenSpaceStatus`'s `rejected` says.
  refused: 'rejected',
  conflicted: 'conflicted',
} as const satisfies Record<SpaceSessionState['persistence']['kind'], OpenSpaceStatus | null>;

export const unwellReport = (persistence: SpaceSessionState['persistence']): string | null => {
  const status = UNWELL_STATUS[persistence.kind];
  return status === null ? null : openSpaceStatusLabel(status);
};

/**
 * How many rows of the listing are open.
 *
 * The closed Meta row is excluded by construction rather than by a check here:
 * it carries no `persistence` and reports nothing, so "N open" and
 * {@link unwellElsewhere} both read this rather than the listing's own length.
 */
export const openCount = (listing: readonly ListingRow[]): number =>
  listing.filter((row) => row.open).length;

/**
 * How many open Spaces are unwell *other than the one being read*.
 *
 * The Space the reader is in is excluded because it reports for itself: its own
 * `PersistenceControl` and standing notice are on this same bar, with the
 * recovery in them. What this counts is the Space you are **not** looking at,
 * which is the case a single session-wide persistence field could not express at
 * all.
 *
 * One derivation rather than one per consumer, because two of them read it and
 * they must not disagree: {@link openSpacesName} and the dot on the trigger both
 * say *that* something needs attention.
 */
export const unwellElsewhere = (listing: readonly ListingRow[], currentSpaceId: UUID): number =>
  listing.filter(
    (row) => row.open && row.spaceId !== currentSpaceId && unwellReport(row.persistence) !== null,
  ).length;

/** The word on the Open Spaces trigger's face, which its name has to contain. */
export const SPACES_LABEL = 'Spaces';

/**
 * The Open Spaces trigger's accessible name.
 *
 * **The name is built from the visible word, not matched to it.** The
 * accessible name must contain the visible label — WCAG 2.5.3, and ADR 0082's
 * naming clause, which is what speech input reaches a control by. Writing the word
 * twice and keeping the two in step is the fix that stops working the first
 * time either side is edited; sharing {@link SPACES_LABEL} is the one that
 * cannot come apart.
 *
 * The count of unwell Spaces joins the name rather than riding on the glyph
 * alone, so the state is never colour alone and a reader who never opens the
 * menu is still told. And a count that joins a sentence agrees with its verb —
 * "2 needs attention" is a template showing through, spoken in full by the one
 * reader who depends on this name for anything.
 *
 * Here rather than in the component because it is the Dock's words and not its
 * markup: pure, and testable without mounting a Space to arrange two unwell
 * ones behind it.
 */
export const openSpacesName = (open: number, unwell: number): string =>
  unwell === 0
    ? `${SPACES_LABEL}. ${open} open.`
    : `${SPACES_LABEL}. ${open} open, ${unwell} ${unwell === 1 ? 'needs' : 'need'} attention.`;

/* ------------------------------------------------------------ open Spaces */

/**
 * An exit that did not happen, which is the only kind the surface draws.
 *
 * Derived from production's own result rather than restated, so an arm added
 * to `ExitSpaceResult` is a compile error here rather than a silence.
 */
export type ExitOutcome = Exclude<ExitSpaceResult, { kind: 'exited' }>;

type ExitRefusal = Extract<ExitSpaceResult, { kind: 'refused' }>['refusal'];

/**
 * The one distinction between the sentences: what the reader can do.
 *
 * `persistence-recovery-required` is one code and two situations, and a reader
 * sent to Resolve when the fix is Retry has been sent to the wrong control — so
 * the recovery, not the code, is the key wherever there is one.
 */
type ExitReportKey =
  | Extract<ExitSpaceResult, { kind: 'warning' }>['warning']
  | Extract<ExitRefusal, { code: 'meta-space-permanent' }>['code']
  | Extract<ExitRefusal, { code: 'persistence-recovery-required' }>['recovery'];

const exitReportKey = (outcome: ExitOutcome): ExitReportKey =>
  outcome.kind === 'warning'
    ? outcome.warning
    : outcome.refusal.code === 'meta-space-permanent'
      ? outcome.refusal.code
      : outcome.refusal.recovery;

/**
 * **A total record, for the reason `UNWELL_STATUS` above is one.** A chain of
 * `if`s answers for an arm it has never heard of, and the answer it gives is
 * silence — which for a refusal means a command that does nothing and says
 * nothing about why. ADR 0082 binds the surface to name which open Space is
 * unwell, so silence is the one outcome this may not produce.
 */
const EXIT_REPORT = {
  'persistence-rejected': (title) =>
    `${title} has changes the server refused, and there is no way to save them. Exiting discards them.`,
  'meta-space-permanent': (title) =>
    `${title} is where navigation starts, so it stays open for the whole session.`,
  retry: (title) => `${title}’s last save failed. Retry the save in that space, then exit it.`,
  'resolve-conflict': (title) =>
    `${title} has changes that conflict with the stored space. Resolve the conflict in that space, then exit it.`,
} as const satisfies Record<ExitReportKey, (title: string) => string>;

/** What an exit that did not happen owes the reader: which Space, and what to do about it. */
export const exitReportSentence = (title: string, outcome: ExitOutcome): string =>
  EXIT_REPORT[exitReportKey(outcome)](title);
