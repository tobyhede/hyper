import { StatusBusy } from '@project/ui';

/**
 * What `Application` draws while startup resolution is outstanding, in place of
 * the blank page it used to leave there.
 *
 * The logo is the served asset rather than the `ParentIcon` glyph, and it is
 * decorative: the message is the accessible text. `index.html` draws the same
 * mark and message before any script runs, so this view replaces that one
 * without a visible change apart from the spinner;
 * `startup-pending-parity.test.tsx` holds the two copies together.
 */
export function StartupPending() {
  return (
    <StatusBusy
      className="min-h-dvh"
      label="Starting…"
      mark={<img src="/infinity-cube-logo.svg" alt="" width={96} className="h-auto" />}
    />
  );
}
