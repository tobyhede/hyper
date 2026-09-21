import { useEffect, useState, type ReactNode } from 'react';
import { startApplication, type ApplicationStartupResolver } from '../startup';
import { StartupPending } from './StartupPending';

/**
 * One application lifetime over a startup resolver. Browser and catalogue hosts
 * supply how the session opens; startup owns the rendering and failure path.
 *
 * **The resolver is fixed at mount, deliberately and without a guard.** Every
 * call site passes an inline lambda, so its identity changes on every render;
 * re-resolving on a change would tear the session down and reopen it each time,
 * and warning on one would warn constantly. One `Application` is one opening —
 * a different startup is a different mount.
 *
 * StrictMode's effect replay shares that opening rather than repeating
 * crossings or the Edits that prepared a story. The `try` is what makes the
 * sharing total: a resolver that throws *synchronously* would otherwise leave
 * `pending` unset and be called a second time, which is the one path that could
 * repeat them.
 */
export function Application({ resolve }: { readonly resolve: ApplicationStartupResolver }) {
  const [opening] = useState(() => {
    let pending: ReturnType<ApplicationStartupResolver> | undefined;
    const once = () => {
      try {
        return resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    return { resolve: () => (pending ??= once()) };
  });
  // The startup view, until the resolver settles and startup renders over it.
  // The served HTML draws the same logo and message, so the wait is continuous
  // from first paint rather than blank on either side of the bundle arriving.
  const [view, setView] = useState<ReactNode>(<StartupPending />);
  useEffect(() => {
    let mounted = true;
    void startApplication(
      {
        render: (children) => {
          if (mounted) setView(children);
        },
      },
      opening.resolve,
    );
    return () => {
      mounted = false;
    };
  }, [opening]);
  return view;
}
