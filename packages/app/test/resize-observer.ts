import { vi } from 'vitest';

/**
 * Install a `ResizeObserver` that observes nothing.
 *
 * jsdom ships none, and React Flow and Base UI construct one before they can
 * draw. jsdom has no layout, so there is no resize to report and a no-op is the
 * whole of the honest answer. Stubbed with `vi.stubGlobal` from the test file's
 * own hook rather than from the setup file, because many of these files call
 * `vi.unstubAllGlobals()`, which would take a setup-file stub away from every
 * test that runs after it.
 */
export function stubResizeObserver(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
}
