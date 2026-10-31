import type { GlobalProvider } from '@ladle/react';
import { TooltipProvider } from '@project/ui';
import '@xyflow/react/dist/style.css';
import '../src/styles.css';
import '../src/tailwind.css';
import '../src/theme-dark.css';
// Composed for its effect: `data-theme` on the root, before any story draws.
import '../stories/support/catalogue-color-scheme';

/** Load the same providers and stylesheets used by production compositions. */
export const Provider: GlobalProvider = ({ children }) => (
  <TooltipProvider>{children}</TooltipProvider>
);
