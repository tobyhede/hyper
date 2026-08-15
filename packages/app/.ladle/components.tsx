import { ThemeState } from '@ladle/react';
import type { GlobalProvider } from '@ladle/react';
import { TooltipProvider } from '@project/ui';
import '../src/tailwind.css';
import '../src/styles.css';
import '../stories/inventory.css';

/**
 * Every story is drawn with the app's **real** stylesheets loaded — the shadcn
 * theme layer and the hand-rolled chrome CSS — and then the inventory's own
 * card tokens on top.
 *
 * Loading the real ones matters. The manifest's entries are hypotheses to
 * confirm, and a component redrawn against a private copy of the palette would
 * confirm nothing: it would look settled here and unstyled in the app. So the
 * toolbar, the selectors and the workspace chooser in these stories are the
 * components the product ships, resolving the tokens the product resolves.
 *
 * The visible consequence is the first thing the inventory has to say, and it
 * is left visible rather than smoothed over: **the app's chrome is dark and the
 * card design's canvas is light paper.** The handoff's token table covers the
 * card and the canvas and stops there, so nothing in it says what the shell,
 * the toolbar or the panes become. Painting them light here would be inventing
 * that answer; showing the clash asks for it.
 */
export const Provider: GlobalProvider = ({ children, globalState }) => (
  <TooltipProvider>
    <div className="inv">
      {globalState.theme === ThemeState.Dark && (
        <div className="inv-open" role="note">
          <strong>Dark mode is not decided.</strong> The handoff carries three candidates —{' '}
          <code>8d</code> chalk line, <code>8e</code> borderless plane, <code>8f</code> graph frame
          — and says not to implement one until it is picked. Nothing is rendered for this toggle on
          purpose; choosing by default would be choosing. Stories below stay in the locked light
          design.
        </div>
      )}
      {children}
    </div>
  </TooltipProvider>
);
