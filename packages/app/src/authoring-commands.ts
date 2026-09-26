import { describeAuthoringRefusal } from './authoring-refusal';
import type { CommandBroke, CommandDiscarded, CommandNotice } from './command-outcomes';
import type { GraphId, MapId } from '@project/core';
import type { AuthoringResult } from './space-authoring';

/**
 * The vocabulary every authoring command module answers in, whatever it
 * authors.
 *
 * An authoring command module answers each Edit as a {@link Capability} whose
 * invocation answers an {@link EditOutcome}, and every surface spends a
 * capability through {@link offered}. What the Edit is, which contexts may
 * author it and how its refusal is said are the module's own
 * (`map-authoring-commands.ts`, `graph-authoring-commands.ts`); this module declares only what is the same for
 * all of them, so no module borrows another's names for it. The contexts they
 * author in are defined once as well (`authoring-contexts.ts`).
 *
 * Like the modules that spend it, it imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it).
 */

/**
 * The sentence a refusal carries when a Space an Edit writes to has not saved:
 * before an Edit that crosses Spaces, after it in the target, or after the
 * containing Space takes the Space Resource's selection.
 */
export const PERSISTENCE_UNSETTLED =
  'The change could not be saved. Check the Space persistence status.';

/**
 * A completed Edit that leaves its context on a Map and a Graph of that Map.
 *
 * A creation answers what it made, and the surface continues there with these
 * — which is why they are answered rather than read back off whatever is
 * selected afterwards. A deletion answers the survivor: every Space Resource
 * that selected what was deleted now selects this pair, and so does a canvas
 * that was showing it.
 */
export interface CompletedContextEdit {
  readonly kind: 'completed';
  readonly mapId: MapId;
  readonly graphId: GraphId;
}

/** The answer to a command that is no longer offered, or whose subject has gone. */
export const UNAVAILABLE = { kind: 'unavailable' } as const;

/**
 * What an authoring Edit answers.
 *
 * `unavailable` is distinct from `refused`: nothing was attempted — the
 * command was withdrawn, or what it addresses has gone — so there is nothing
 * to report. `Completed` is the completed arm a capability declares, so a
 * creation can carry the identities it made without a second outcome
 * vocabulary.
 */
export type EditOutcome<
  Completed extends { readonly kind: 'completed' } = { readonly kind: 'completed' },
> =
  | Completed
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused'; readonly report: CommandNotice };

/**
 * A synchronous Space Authoring answer as an Edit outcome, a refusal reported
 * under `title`.
 *
 * `queued` is an Edit accepted behind the one completing, which lands when that
 * one drains; it answers `completed`, so an editor closes on it as on a
 * completed rename (`renameDraftAnswer`).
 */
export const completionOutcome = (result: AuthoringResult, title: string): EditOutcome => {
  switch (result.kind) {
    case 'refused':
      return {
        kind: 'refused',
        report: { title, message: describeAuthoringRefusal(result.refusal) },
      };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'completed':
    case 'queued':
      return { kind: 'completed' };
  }
};

/**
 * One command a surface offers, and whether it may offer it.
 *
 * `available` is the answer when the capability was read, which is what a
 * surface draws its unavailable treatment from. `invoke` asks again when it is
 * pressed and answers `unavailable` if the answer has changed, so a surface
 * drawn from a stale answer cannot complete an Edit that is no longer offered.
 */
export interface Capability<Invocation> {
  readonly available: boolean;
  readonly invoke: Invocation;
}

/**
 * A capability as a surface draws it: the press built from its own
 * invocation, or `null` where it is unavailable.
 *
 * The one way a surface spends a capability, so its unavailable treatment and
 * what it invokes are read off one answer and cannot disagree. The press is the surface's — it
 * decides where the outcome goes and where the caret continues — and the
 * invocation still asks again when it is pressed.
 */
export const offered = <Invocation, Press>(
  capability: Capability<Invocation>,
  press: (invoke: Invocation) => Press,
): Press | null => (capability.available ? press(capability.invoke) : null);

/**
 * The editor's answer to a rename: the sentence that holds a refused draft
 * open, or `null` to close it.
 *
 * `unavailable` and a broken invocation close it too — neither is the author's
 * draft being wrong, and the surface ends a withdrawn editor on its next
 * render in any case. A break has already reached the reporter. A discarded
 * settlement has nothing to say.
 */
export const renameDraftAnswer = (
  outcome: EditOutcome | CommandBroke | CommandDiscarded,
): string | null => {
  switch (outcome.kind) {
    case 'refused':
      return outcome.report.message;
    case 'completed':
    case 'unchanged':
    case 'unavailable':
    case 'broke':
    case 'discarded':
      return null;
  }
};
