/** Just enough of a browsing context to open one address, and honestly optional. */
interface BrowsingHost {
  readonly open?: ((url?: string, target?: string, features?: string) => Window | null) | undefined;
}

/**
 * Read `open` off a host that may not have one.
 *
 * The DOM lib types `Window.open` as always present. Restating the capability
 * as optional is what lets a missing `open` be a real question rather than one
 * the compiler believes it has already answered. `Window` satisfies this shape.
 */
const openOf = (host: BrowsingHost): BrowsingHost['open'] => host.open;

/**
 * Open one address in a new browsing context, answering whether `open` ran.
 *
 * `noopener` makes a successful `window.open` return `null`, the same as a
 * blocked popup, so the return value is not a success signal. The only
 * failures this can honestly answer are a missing `open` and a throw. Held by
 * `packages/app/test/open-independently.test.ts`.
 */
export function openIndependently(href: string): boolean {
  const open = openOf(globalThis);
  if (open === undefined) return false;
  try {
    open(href, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}
