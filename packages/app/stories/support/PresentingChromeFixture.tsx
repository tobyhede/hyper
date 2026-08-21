import { useCallback } from 'react';
import type { Space } from '@project/graph';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { usePresentingKeys } from '#src/presenting-keys';
import { PresentingChrome } from '#components/PresentingChrome';
import { useStoryNavigation } from './navigation';
import { walkthroughSpace } from './spaces';

export interface PresentingChromeFixtureProps {
  /** Which Space is traversed. See `./spaces`. */
  readonly space?: Space;
  /**
   * How many production `advance()` calls the story opens with.
   *
   * A sink is not a state a Graph can be authored into — every Card a traversal
   * may begin at has an Edge leaving it — so the only way to show one is to walk
   * there. These are Navigation's own moves made once at composition, so the
   * Traversal history behind the story is one Navigation really walked rather
   * than a starting value the harness invented (ADR 0052).
   */
  readonly advances?: number;
  /**
   * How wide the region holding the chrome is.
   *
   * A layout constraint and nothing more. The chrome is its own container query
   * scope, so the width it is given here is the width its responsive rule reads
   * — the same rule that reads a narrow viewport in the application, asked the
   * same question by a narrow region in the catalogue.
   */
  readonly width?: string;
}

/**
 * The unchanged production `PresentingChrome`, over real Navigation.
 *
 * Everything the chrome draws comes from Navigation: the moves and which one is
 * selected, whether Traversal history can retreat, and every operation the
 * controls call. The fixture supplies a Space, an opening walk and a box to sit
 * in, and holds no selected index, no history and no copy of either.
 *
 * It also binds the **production** global Traversal keys, because one of the
 * claims here is about the two together: Space on a chrome control must activate
 * that control exactly once rather than advancing through the window listener
 * and then firing the click. A story that bound its own listener would prove its
 * own listener.
 *
 * The region is a bounded, positioned box and deliberately **not** a canvas
 * stand-in: the chrome is screen-fixed DOM with no React Flow geometry, so there
 * is nothing about a canvas for a facsimile to get wrong or right.
 */
export function PresentingChromeFixture({
  space = walkthroughSpace,
  advances = 0,
  width = '100%',
}: PresentingChromeFixtureProps) {
  const readSpace = useCallback(() => space, [space]);
  const { navigation, state } = useStoryNavigation(readSpace, (composed) => {
    composed.present();
    for (let step = 0; step < advances; step += 1) composed.advance();
  });
  const presenting = state.mode === 'presenting';
  usePresentingKeys(presenting, {
    advance: navigation.advance,
    retreat: navigation.retreat,
    selectBranch: navigation.selectBranch,
    exitPresenting: navigation.exitPresenting,
  });

  return (
    <div
      data-testid="presenting-stage"
      className="relative overflow-hidden rounded-md border border-border bg-background"
      style={{ width, height: '20rem' }}
    >
      {presenting && (
        <PresentingChrome
          moves={navigation.moves()}
          // There is a Card to go back to only once a traversal has left its
          // first, and only presenting has Traversal history at all — the same
          // narrowing `App` makes, spent on the value behind it rather than on
          // the mode. `presenting` above is what narrows `state` to the mode
          // that carries a history.
          canRetreat={state.traversalHistory.length > 1}
          onSelectBranch={navigation.selectBranch}
          onAdvance={navigation.advance}
          onRetreat={navigation.retreat}
          onExit={navigation.exitPresenting}
        />
      )}
    </div>
  );
}
