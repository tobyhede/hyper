import { describe, expect, it } from 'vitest';
import { watchUnownedReactUpdates, type ErrorConsole } from '../support/unowned-react-updates';

/** A console that keeps what it is asked to write. */
const recordingConsole = (): ErrorConsole & { readonly written: unknown[][] } => {
  const written: unknown[][] = [];
  return {
    written,
    error: (...args: unknown[]) => {
      written.push(args);
    },
  };
};

const NOT_WRAPPED = 'Warning: An update to %s inside a test was not wrapped in act(...).%s';
const NOT_CONFIGURED =
  'Warning: The current testing environment is not configured to support act(...)';

/**
 * The guard `vitest.setup.ts` installs. It fails a test on React's two act
 * reports and on nothing else, and it writes every call through unchanged, so
 * it never hides the diagnostic it fails on or any other.
 */
describe('watching for unowned React updates', () => {
  it('fails on an update reported outside act, naming the component', () => {
    const target = recordingConsole();
    const watch = watchUnownedReactUpdates(target);

    target.error(NOT_WRAPPED, 'CanvasContinuation', '\n    at CanvasContinuation');

    expect(() => watch.failIfAny()).toThrow(
      /1 React update\(s\) landed outside any test boundary:\nWarning: An update to CanvasContinuation inside a test was not wrapped in act\(\.\.\.\)\.$/u,
    );
  });

  it('fails on an act run while the act environment is off', () => {
    const target = recordingConsole();
    const watch = watchUnownedReactUpdates(target);

    target.error(NOT_CONFIGURED);

    expect(() => watch.failIfAny()).toThrow(/not configured to support act/u);
  });

  it('writes every call through with its own arguments', () => {
    const target = recordingConsole();
    const watch = watchUnownedReactUpdates(target);

    target.error(NOT_WRAPPED, 'App', '\n    at App');
    target.error('Open Spaces observer failed', 42);

    expect(target.written).toEqual([
      [NOT_WRAPPED, 'App', '\n    at App'],
      ['Open Spaces observer failed', 42],
    ]);
    expect(() => watch.failIfAny()).toThrow();
  });

  it('leaves every other diagnostic to the test that wrote it', () => {
    const target = recordingConsole();
    const watch = watchUnownedReactUpdates(target);

    target.error('Warning: Cannot update a component while rendering a different component');
    target.error(new Error('not a string'));

    expect(() => watch.failIfAny()).not.toThrow();
  });

  it('forgets what it reported, so one leak fails one test', () => {
    const target = recordingConsole();
    const watch = watchUnownedReactUpdates(target);
    target.error(NOT_WRAPPED, 'App', '');

    expect(() => watch.failIfAny()).toThrow();
    expect(() => watch.failIfAny()).not.toThrow();
  });
});
