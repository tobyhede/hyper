import type { LayoutId } from '@project/core';
import { Placement } from '@project/graph';
import { createObservableState } from '@project/persistence';
import type { OpenSpace } from './open-spaces';
import { createRenderAdapter, type RenderAdapterAuthoring } from './render-adapter';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';

/** One embedded canvas's gestures, completed by the target's sole Space Authoring. */
export function createEmbeddedAuthoring(entry: OpenSpace, layoutId: LayoutId) {
  const notifications = createObservableState(null, (error) =>
    console.error('Embedded authoring observer failed', error),
  );
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    if (
      completion.kind === 'opened-card' ||
      completion.kind === 'closed-card' ||
      completion.kind === 'resized-card' ||
      completion.kind === 'edited-card' ||
      completion.kind === 'settled-card-movement' ||
      completion.kind === 'removed-card-from-layout'
    ) {
      return entry.app.authoring.completeInLayout(layoutId, completion);
    }
    return { kind: 'refused', refusal: { code: 'edge-card-outside-layout' } };
  };
  const authoring: RenderAdapterAuthoring = {
    getState: entry.app.authoring.getState,
    complete,
    authoredPlacement: () => {
      const resolved = entry.app.currentSpace().lookup.layout(layoutId);
      return resolved === undefined ? null : Placement.fromLayout(resolved.layout);
    },
    // The embedded projection is derived from this Layout on every Edit. Its
    // transient render reports must never replace the full canvas's placement.
    reportRendered: () => undefined,
    replacePlacement: () => undefined,
    subscribe: notifications.subscribe,
  };
  const adapter = createRenderAdapter(authoring);
  return {
    authoring,
    adapter,
    observe: () => {
      notifications.notify();
      return entry.app.authoring.subscribe(notifications.notify);
    },
  };
}
