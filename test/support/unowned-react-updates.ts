/**
 * React's reports of an update that no test boundary owns.
 *
 * React 18 says so only through `console.error`: an update scheduled outside
 * `act` while the act environment is on, and an `act` running while it is off.
 * Nothing else is matched, so every other diagnostic is left to the test that
 * produced it.
 */
const UNOWNED_UPDATE = /not wrapped in act\(|not configured to support act\(/u;

/** The one console member watched, so a test can hand in a recording one. */
export type ErrorConsole = Pick<Console, 'error'>;

export interface UnownedReactUpdates {
  /**
   * Throws, naming each update reported since the last call, when there was
   * any, and forgets them either way.
   */
  readonly failIfAny: () => void;
}

/**
 * Wrap `target.error` so React's unowned-update reports are recorded as well
 * as written.
 *
 * Every call reaches the console it was made on, with the same arguments:
 * the report is kept, not replaced, so a failure it causes still has React's
 * component stack beside it in the output.
 */
export const watchUnownedReactUpdates = (target: ErrorConsole): UnownedReactUpdates => {
  const unowned: string[] = [];
  const write = target.error.bind(target);
  target.error = (...args: unknown[]) => {
    const [message, component] = args.map(String);
    if (message !== undefined && UNOWNED_UPDATE.test(message)) {
      // React formats the warning with `%s` for the component and its stack;
      // the name is enough to find the update, and the stack is in the output.
      const named = message.replace('%s', component ?? 'a component');
      unowned.push(named.replaceAll('%s', '').split('\n')[0] ?? named);
    }
    write(...args);
  };
  return {
    failIfAny: () => {
      if (unowned.length === 0) return;
      const found = unowned.splice(0);
      throw new Error(
        `${String(found.length)} React update(s) landed outside any test boundary:\n${[
          ...new Set(found),
        ].join('\n')}`,
      );
    },
  };
};
