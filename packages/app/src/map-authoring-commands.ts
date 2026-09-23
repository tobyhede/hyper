import type { MapId } from '@project/core';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { CommandBroke, CommandNotice } from './command-outcomes';
import type { ComposedApp } from './compose-app';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';

/**
 * Map Edits, as one interface for every context that authors a Map.
 *
 * A Map is authored from two places: the Command Dock, over the Space on the
 * canvas, and an Open Space Resource's rail, over the target Space it embeds.
 * Each used to decide for itself whether the command was available, which Edit
 * to complete and how to say a refusal. This module decides those once, behind
 * two private adapters — one per context — and answers both callers in the same
 * outcome vocabulary (`.scratch/command-outcomes/issues/06`).
 *
 * **What stays outside.** Which Map is selected, Copy link, where the caret
 * goes and how a report is drawn are the surfaces'. The report's *lifetime* —
 * publishing, dismissal and the Map-change reset — is command outcomes'
 * (`command-outcomes.ts`): a refused outcome carries the complete
 * {@link CommandNotice}, so that module holds it without reading an
 * `AuthoringRefusal`. So this module imports no continuation, no React and no
 * DOM.
 */

/**
 * What a Map Edit answers.
 *
 * `unavailable` is distinct from `refused`: nothing was attempted — the
 * command was withdrawn, or its Map has gone — so there is nothing to report.
 * `Completed` is the completed arm a capability declares, so a creation can
 * carry the identities it made without a second outcome vocabulary.
 */
export type MapEditOutcome<
  Completed extends { readonly kind: 'completed' } = { readonly kind: 'completed' },
> =
  | Completed
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused'; readonly report: CommandNotice };

/**
 * One command a surface offers, and whether it may offer it.
 *
 * `available` is the answer when the capability was read, which is what a
 * surface draws its unavailable treatment from. `invoke` asks again when it is
 * pressed and answers `unavailable` if the answer has changed, so a surface
 * drawn from a stale answer cannot complete an Edit that is no longer offered.
 */
export interface MapCapability<Invocation> {
  readonly available: boolean;
  readonly invoke: Invocation;
}

/** Rename one Map: synchronous, so an inline editor can hold a refused draft open. */
export type MapRename = MapCapability<(title: string) => MapEditOutcome>;

/** The commands addressed to one Map. */
export interface MapCommands {
  readonly rename: MapRename;
}

/**
 * Every Map Edit one context offers.
 *
 * `map(mapId)` answers the Map-addressed commands; Space-scoped creation joins
 * beside it (ticket 07), and deletion joins `MapCommands` (ticket 08), each as
 * a {@link MapCapability} whose invocation answers a promise of a
 * {@link MapEditOutcome}.
 */
export interface MapAuthoringCommands {
  readonly map: (mapId: MapId) => MapCommands;
}

/**
 * The editor's answer to a rename: the sentence that holds a refused draft
 * open, or `null` to close it.
 *
 * `unavailable` and a broken invocation close it too — neither is the author's
 * draft being wrong, and the surface ends a withdrawn editor on its next
 * render in any case. A break has already reached the reporter.
 */
export const renameDraftAnswer = (outcome: MapEditOutcome | CommandBroke): string | null =>
  outcome.kind === 'refused' ? outcome.report.message : null;

type RenamedMap = Extract<AuthoringCompletion, { readonly kind: 'renamed-map' }>;

/** What differs between the two contexts, and nothing else. */
interface MapAuthoringContext {
  /** General availability, asked at read and again at invocation. */
  readonly available: () => boolean;
  /** Whether this context can author `mapId` as the Space stands now. */
  readonly addresses: (mapId: MapId) => boolean;
  readonly complete: (mapId: MapId, completion: RenamedMap) => AuthoringResult;
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

/**
 * A Space Authoring answer as a Map Edit outcome.
 *
 * `queued` is an Edit accepted behind the one completing, which lands when that
 * one drains; the surface answers it as it answers a completed one, which is
 * what the editor did before this module existed.
 */
const renameOutcome = (result: AuthoringResult): MapEditOutcome => {
  switch (result.kind) {
    case 'refused':
      return {
        kind: 'refused',
        report: { title: 'Map unchanged', message: describeAuthoringRefusal(result.refusal) },
      };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'completed':
    case 'queued':
      return { kind: 'completed' };
  }
};

const mapAuthoringCommands = (context: MapAuthoringContext): MapAuthoringCommands => ({
  map: (mapId) => {
    const live = (): boolean => context.available() && context.addresses(mapId);
    return {
      rename: {
        available: live(),
        invoke: (title) =>
          live()
            ? renameOutcome(context.complete(mapId, { kind: 'renamed-map', mapId, title }))
            : UNAVAILABLE,
      },
    };
  },
});

/** The composition a top-level context authors through. */
export type TopLevelMapAuthoring = Pick<ComposedApp, 'authoring' | 'currentSpace' | 'navigation'>;

/**
 * Map Edits on the Space the canvas draws.
 *
 * It addresses the **selected** Map only: Space Authoring's top-level rename
 * resolves the selection at derivation and refuses any other id as
 * `map-not-found` (`space-authoring.ts`), so a Map that is not selected when
 * the press lands is a stale press — unavailable — rather than a refusal.
 *
 * `available` is the composition's answer to whether a chrome command may run;
 * it is as live as the caller makes it.
 */
export function topLevelMapAuthoringCommands(
  app: TopLevelMapAuthoring,
  available: () => boolean,
): MapAuthoringCommands {
  return mapAuthoringCommands({
    available,
    addresses: (mapId) =>
      app.navigation.getState().selectedMapId === mapId &&
      app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (_mapId, completion) => app.authoring.complete(completion),
  });
}

/**
 * Map Edits on a target Space an Open Space Resource embeds.
 *
 * It addresses any Map of the target while the target is still the open entry
 * the rail was drawn from — an exited Space is no longer authored through its
 * old composition — and completes through `completeInMap`, which authors the
 * addressed Map without moving the target's own canvas.
 */
export function embeddedMapAuthoringCommands(
  target: OpenSpace,
  spaces: Pick<OpenSpaces, 'entry'>,
  available: () => boolean,
): MapAuthoringCommands {
  return mapAuthoringCommands({
    available,
    addresses: (mapId) =>
      spaces.entry(target.id) === target &&
      target.app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (mapId, completion) => target.app.authoring.completeInMap(mapId, completion),
  });
}
