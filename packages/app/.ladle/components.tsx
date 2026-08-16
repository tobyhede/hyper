import type { GlobalProvider } from '@ladle/react';
import { TooltipProvider } from '@project/ui';
import '../src/tailwind.css';
import '@xyflow/react/dist/style.css';
import '../src/styles.css';
import '../stories/support/inventory.css';

/**
 * Every story is drawn with the app's **real** stylesheets loaded — the shadcn
 * theme layer and the application chrome CSS.
 *
 * Loading the real ones matters. The catalogue entries are hypotheses to
 * confirm, and a component redrawn against a private copy of the palette would
 * confirm nothing: it would look settled here and unstyled in the app. So the
 * toolbar, the selectors and the workspace chooser in these stories are the
 * components the product ships, resolving the tokens the product resolves.
 *
 * The catalogue does not translate the production theme into a separate
 * story-only light or dark treatment.
 */
export const Provider: GlobalProvider = ({ children }) => (
  <TooltipProvider>
    <div className="inv">{children}</div>
  </TooltipProvider>
);
