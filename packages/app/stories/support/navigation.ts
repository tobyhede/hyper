import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Space } from '@project/graph';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { createNavigation, type Navigation, type NavigationState } from '#src/navigation';
import { requireDefaultDiagram } from '#src/diagram-resolution';

/**
 * Production Navigation, composed the way a story needs it and no other way.
 *
 * One surface opens a real Navigation — the presenting chrome — and
 * `PresentingChromeFixture` is this module's only importer. It was two until
 * ADR 0082 retired the Space Sidebar, and the shared-composition argument went
 * with the second consumer: what is left is a single-consumer helper, and it is
 * written down that way rather than dressed up as a seam it no longer is.
 *
 * What it still carries is the reasoning, not the line count. Three rules live
 * here and each one is a mistake a fixture would otherwise make again: the
 * Space reader Navigation resolves every selection against has to answer *now*
 * rather than at mount (`composeStoryNavigation` below), the instance is
 * *state* rather than a memo, and the opening call runs exactly once. Inlining
 * them into the one fixture would put a page of lifecycle argument in the
 * middle of a component whose subject is the chrome — a decision to take
 * deliberately if a reader thinks the indirection now costs more than it saves,
 * not a tidy-up to do in passing.
 *
 * It is deliberately **not** a second lifecycle owner and not a visual facsimile
 * (ADR 0052). It holds no selected index, no Traversal history and no copy of
 * anything Navigation publishes: what comes back is Navigation itself and the
 * state it published, read through the same `useSyncExternalStore` the
 * application reads it through.
 */
export interface StoryNavigation {
  readonly navigation: Navigation;
  /** Navigation's published state, read exactly as the application reads it. */
  readonly state: NavigationState;
}

interface ComposedNavigation {
  readonly navigation: Navigation;
  readonly readFrom: (next: () => Space) => void;
}

/**
 * Navigation, plus the one seam that lets an instance outlive the reader it was
 * composed with.
 *
 * Navigation resolves every selection against `currentSpace()` — that is what
 * stops it naming a Diagram the Space does not hold — so what it holds has to
 * be one indirection over the reader that answers *now*, not the closure that
 * answered at mount. A `useRef` is the usual shape for that and is refused
 * here: React's own lint rule forbids reading a ref during render, and the
 * initializer below runs during one. The mutable reader is therefore a local of
 * this function, reached only by the Navigation composed over it and replaced
 * only through `readFrom` — so the render path cannot read it at all, and the
 * effect that calls `readFrom` is its one writer.
 */
function composeStoryNavigation(
  read: () => Space,
  begin: (navigation: Navigation) => void,
): ComposedNavigation {
  let current = read;
  const initialSpace = current();
  const navigation = createNavigation(
    () => current(),
    requireDefaultDiagram(initialSpace),
    initialSpace,
  );
  begin(navigation);
  return {
    navigation,
    readFrom: (next) => {
      current = next;
    },
  };
}

/**
 * Compose Navigation for a story and read its state.
 *
 * `begin` runs **once**, against the freshly composed Navigation, and is how a
 * story arrives in the state it is about — presenting, or three moves into a
 * Graph. It drives production operations rather than seeding a state of its
 * own, so the Traversal history a story shows is one Navigation traversed.
 * Subsequent renders do not re-run it: a story that then clicks its way
 * somewhere else must not have its own opening argued back at it.
 */
export function useStoryNavigation(
  currentSpace: () => Space,
  begin: (navigation: Navigation) => void = () => undefined,
): StoryNavigation {
  // State, not a memo. Navigation holds the selected Diagram, the Active Graph,
  // the mode and the Traversal history — everything a Ladle spec clicks its way
  // into — and a memo is a caching hint React may discard, not a place to keep
  // any of that. Keyed on a fixture's props it was worse than that: a prop
  // changing rebuilt Navigation outright and undid every click before it.
  const [composed] = useState(() => composeStoryNavigation(currentSpace, begin));
  // Installed before anything a caller reconciles after this hook, so a render
  // that changes the Space *and* the state has the new reader in place first.
  useEffect(() => {
    composed.readFrom(currentSpace);
  }, [composed, currentSpace]);
  const state = useSyncExternalStore(composed.navigation.subscribe, composed.navigation.getState);
  return { navigation: composed.navigation, state };
}
