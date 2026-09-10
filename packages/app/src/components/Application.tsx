import { useEffect, useState, type ReactNode } from 'react';
import { startApplication, type ApplicationStartupResolver } from '../startup';

/**
 * One application lifetime over a startup resolver. Browser and catalogue hosts
 * supply how the session opens; startup owns the rendering and failure path.
 * A resolver is fixed for this mount, and StrictMode's effect replay shares its
 * opening rather than repeating crossings or the Edits that prepared a story.
 */
export function Application({ resolve }: { readonly resolve: ApplicationStartupResolver }) {
  const [opening] = useState(() => {
    let pending: ReturnType<ApplicationStartupResolver> | undefined;
    return { resolve: () => (pending ??= resolve()) };
  });
  const [view, setView] = useState<ReactNode>(null);
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
