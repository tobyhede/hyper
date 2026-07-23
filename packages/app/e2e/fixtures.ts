import { test as base, expect } from '@playwright/test';

/**
 * The Playwright `test` every spec in this directory imports, extended with a
 * gate that fails a test if React Flow complained while it ran.
 *
 * React Flow ships sixteen numbered dev warnings, and several describe states
 * this adapter can reach — an edge naming a handle that doesn't resolve (#008),
 * a fresh `nodeTypes`/`edgeTypes` object every render (#002), an unsized
 * container (#004), `<Handle>` outside a custom node (#010). It logs them and
 * carries on rendering something subtly wrong, so without this they cost
 * nothing to introduce and nothing catches them. See
 * `.scratch/react-flow-guidance/issues/01-fail-e2e-on-react-flow-warnings.md`.
 *
 * The gate is deliberately narrow: only React Flow's own messages and uncaught
 * page errors. Failing on arbitrary console output would drag in Vite HMR and
 * devtools chatter, and a gate that cries wolf gets switched off.
 *
 * Note these warnings are development-only (`createDevWarn` in
 * `@xyflow/system` is a no-op unless `NODE_ENV === 'development'`). Playwright
 * drives the dev server, so they are present here; this gate would be inert
 * against a production build.
 */

/** React Flow's own warnings, emitted as
 *  `[React Flow]: <message> Help: https://reactflow.dev/error#<id>`. Matching
 *  the help URL as well as the label keeps the gate working if the label ever
 *  changes — the numbered messages are the part worth catching. */
function isReactFlowComplaint(text: string): boolean {
  return text.includes('[React Flow]') || text.includes('reactflow.dev/error#');
}

/** The gate is auto-use, so no spec has to opt in; the collected messages are
 *  exposed as the fixture value for the rare test that wants to inspect them. */
export const test = base.extend<{ reactFlowComplaints: string[] }>({
  reactFlowComplaints: [
    async ({ page }, use) => {
      const complaints: string[] = [];

      page.on('console', (message) => {
        const type = message.type();
        if (type !== 'warning' && type !== 'error') return;
        if (isReactFlowComplaint(message.text())) complaints.push(`${type}: ${message.text()}`);
      });
      page.on('pageerror', (error) => complaints.push(`pageerror: ${error.message}`));

      await use(complaints);

      // React Flow's message names the rule and links its own docs, so the
      // verbatim text is the whole diagnosis.
      expect(complaints, 'React Flow reported a problem while this test ran').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
export type { Locator, Page } from '@playwright/test';
