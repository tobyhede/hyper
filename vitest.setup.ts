import '@testing-library/jest-dom/vitest';

/**
 * React honours `act(...)` only when this global says the environment supports
 * it, and warns on every call that finds it unset.
 *
 * Testing Library sets it around its *own* act calls — `render`, `fireEvent` —
 * and deliberately sets it *false* inside `waitFor`, so that asynchronous work
 * landing mid-wait is not reported as an un-acted update. Neither covers a test
 * that calls `act` directly, which is how a synchronous publication from a store
 * outside React gets flushed. Without the flag React still applies the update, so
 * the test passes and the warning is the only trace.
 *
 * Guarded on `document` for the same reason as the stubs below: this file also
 * runs under `environment: 'node'`, where there is no React renderer at all.
 */
if (typeof document !== 'undefined') {
  // SAFETY: `IS_REACT_ACT_ENVIRONMENT` is React's own ambient test flag, not
  // part of `typeof globalThis` — the narrow shape names only the one property
  // this file writes.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

/**
 * jsdom ships no `DOMMatrixReadOnly`, and React Flow needs one.
 *
 * `updateNodeInternals` in `@xyflow/system` reads the viewport's zoom with
 * `new window.DOMMatrixReadOnly(getComputedStyle(viewport).transform)` before it
 * re-measures a node's handles. Under jsdom that throws — and it throws inside a
 * `requestAnimationFrame` callback, so the error never reaches a test body:
 * Vitest prints every test as passing and then exits 1 on the unhandled error.
 * `CardNode` deliberately never calls `updateNodeInternals` — see AGENTS.md — but
 * React Flow's own `useResizeObserver` reaches the same call with `force: true`,
 * so any test rendering a real `<ReactFlow>` can hit it without anyone asking.
 *
 * The zoom it reads divides every measured handle offset, so answering with a
 * fixed identity would misplace handles silently the moment a test zooms. React
 * Flow writes the viewport transform as `translate(Xpx,Ypx) scale(Z)` and
 * nothing else, so that form — plus the `matrix(...)` a real `getComputedStyle`
 * would resolve it to — is what this reads back. Anything else is the identity.
 *
 * Deliberately narrow: the six 2D components and the `m*` aliases over them, not
 * an implementation of the interface. Both guards matter — the setup file also
 * runs under `environment: 'node'`, where there is no `window` at all, and a real
 * `DOMMatrixReadOnly` must win wherever one exists.
 */
if (typeof window !== 'undefined' && !('DOMMatrixReadOnly' in window)) {
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  const parse = (transform: string): typeof identity => {
    const matrix = /matrix\(([^)]*)\)/.exec(transform);
    if (matrix?.[1] !== undefined) {
      const [a, b, c, d, e, f] = matrix[1].split(',').map((part) => Number(part));
      return {
        a: a ?? identity.a,
        b: b ?? identity.b,
        c: c ?? identity.c,
        d: d ?? identity.d,
        e: e ?? identity.e,
        f: f ?? identity.f,
      };
    }
    const scale = /scale\(\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)/.exec(transform);
    const translate = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(transform);
    const scaleX = scale?.[1] === undefined ? identity.a : Number(scale[1]);
    return {
      a: scaleX,
      b: identity.b,
      c: identity.c,
      d: scale?.[2] === undefined ? scaleX : Number(scale[2]),
      e: translate?.[1] === undefined ? identity.e : Number(translate[1]),
      f: translate?.[2] === undefined ? identity.f : Number(translate[2]),
    };
  };

  class DOMMatrixReadOnlyStub {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;

    constructor(init?: string) {
      const { a, b, c, d, e, f } = typeof init === 'string' ? parse(init) : identity;
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
    }

    get m11(): number {
      return this.a;
    }
    get m12(): number {
      return this.b;
    }
    get m21(): number {
      return this.c;
    }
    get m22(): number {
      return this.d;
    }
    get m41(): number {
      return this.e;
    }
    get m42(): number {
      return this.f;
    }
  }

  // `defineProperty` rather than assignment: the stub implements the handful of
  // members React Flow reads, not the whole `DOMMatrixReadOnly` interface, and
  // widening it to satisfy the DOM type would be a lie about what it does.
  Object.defineProperty(window, 'DOMMatrixReadOnly', {
    configurable: true,
    writable: true,
    value: DOMMatrixReadOnlyStub,
  });
}

/**
 * jsdom has no layout, and so no `scrollIntoView` — cmdk calls one on the item
 * its arrow keys make active.
 *
 * A no-op is the whole of the right answer here: nothing in a headless DOM
 * scrolls, so there is no behaviour to simulate, and the alternative is every
 * test that renders a Command list carrying the same three-line stub. It is
 * defined only where the real method is missing, so a future environment that
 * implements it keeps its own.
 *
 * On `Element` rather than `HTMLElement`, because that is where the DOM declares
 * it and where cmdk's item lives either way. Asked with `in` for the same reason
 * the `DOMMatrixReadOnly` stub above is: the DOM types say the method is always
 * there, so comparing it against `undefined` is a condition the compiler — and
 * the lint rule over it — can prove pointless, while the environment this runs
 * in is exactly the one where it is not.
 */
if (typeof Element !== 'undefined' && !('scrollIntoView' in Element.prototype)) {
  // Defined rather than assigned, again as above: the `in` check narrows the
  // prototype to `never` in the branch where the property is missing, which is
  // the only branch that wants to write it.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}

/**
 * jsdom measures every element as 0x0, and d3-zoom divides by that.
 *
 * `XYPanZoom` caches d3-zoom's extent from the pane's `getBoundingClientRect()`
 * and refreshes it from a `ResizeObserver` (`@xyflow/system`). A test that stubs
 * `ResizeObserver` — as one must, since jsdom ships none — leaves the cache at
 * whatever the first measurement said, and under jsdom that is a zero-size
 * extent. An *animated* `fitView` then interpolates across a viewport of zero
 * width, which is a division by zero: the transform goes `NaN` for the length of
 * the animation, and every value derived from its scale goes with it, including
 * `Background`'s pattern geometry. It settles once the animation ends, so the
 * damage is transient — but React logs each `NaN` attribute on the way through,
 * and noise that arrives five lines at a time is noise a real warning hides in.
 *
 * `duration: 0` does not reproduce it; the fit *target* is computed correctly
 * from React Flow's own store, which does fall back to 500 for an unmeasured
 * container. Only the interpolation reads the DOM.
 *
 * Scoped to the one element d3-zoom measures — `ZoomPane`'s pane, which React
 * Flow renders as `react-flow__renderer`. Everything else keeps jsdom's zeroes,
 * so no test that asserts on layout quietly changes meaning. Card geometry is
 * unaffected regardless: `projection.ts` declares `measured` rather than letting
 * React Flow read it from the DOM.
 */
if (typeof window !== 'undefined') {
  const PANE = 'react-flow__renderer';
  const PANE_SIZE = { width: 800, height: 600 };
  // Read through a descriptor rather than naming `Element.prototype.getBoundingClientRect`
  // directly: the latter is an unbound method reference, which lint rejects.
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  // SAFETY: `PropertyDescriptor.value` is typed `any`; `getBoundingClientRect`
  // is the one property read off this descriptor, so its real signature is
  // known even though the descriptor's own type can't express it.
  const inherited = descriptor?.value as ((this: Element) => DOMRect) | undefined;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    if (!this.classList.contains(PANE)) return inherited?.call(this) ?? new DOMRect();
    const { width, height } = PANE_SIZE;
    return {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({ x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height }),
    };
  };
}

/**
 * CodeMirror measures text ranges to size its viewport after an edit. jsdom
 * supplies `Range` but no layout-backed rectangle methods, so the measurement
 * otherwise throws asynchronously after an editor test has already passed.
 * Empty geometry is the honest jsdom answer and keeps browser layout behavior
 * in Playwright, where the real methods exist.
 */
if (typeof Range !== 'undefined' && !('getClientRects' in Range.prototype)) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

if (typeof Range !== 'undefined' && !('getBoundingClientRect' in Range.prototype)) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: () => new DOMRect(),
  });
}

/**
 * jsdom ships no `matchMedia`, and the shared Sidebar asks for one.
 *
 * `useIsMobile` subscribes to `(max-width: 767px)` to decide whether the
 * workspace chrome draws as a sidebar or as a Sheet (ADR 0053). jsdom has no
 * layout and no media engine, so the honest answer is a query that never
 * matches and never changes: every rendering test then exercises the desktop
 * sidebar, which is the surface those tests are about.
 *
 * Guarded like the stubs above — the setup file also runs under
 * `environment: 'node'`, and any environment that implements the real thing
 * keeps it. The guard reads the value rather than asking `in`, because jsdom
 * *declares* `matchMedia` and leaves it `undefined`: the property is there and
 * calling it throws. Read off a widened alias so the check is about the value
 * this environment actually holds rather than about the DOM lib's promise,
 * which is what would make it a condition lint can prove pointless.
 */
// SAFETY: this file runs under both `jsdom` and `node` test environments, so
// `window` may not exist on `globalThis` at all — the narrow optional shape
// reads whatever is actually there instead of asserting the DOM lib's promise
// that `window` (and `matchMedia` on it) is always defined.
const declaredMatchMedia = (globalThis as { window?: { matchMedia?: unknown } }).window?.matchMedia;
if (typeof window !== 'undefined' && typeof declaredMatchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
