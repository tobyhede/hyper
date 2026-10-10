# 01: Decide what happens to keys typed before the Markdown editor loads

**What to build:** a deliberate, written answer to what happens when an author presses Edit and starts typing while the lazily loaded Markdown source editor is still arriving. Today the Suspense fallback cannot take focus and the Edit button unmounts, so focus falls to the document body and every keystroke typed in that window is lost. Nothing in ADR 0063, ADR 0067, ADR 0064 or the UI guide decides this.

**Blocked by:** None (needs a decision first).

**Status:** ready-for-human

Reproduced in the pre-release audit by a Playwright spec that delays the editor chunk 1.5 s, presses Edit and types at once. The assertion that the typed text appears fails. The spec was reverted pending this decision; its source, written for `packages/app/e2e/`, is below.

Options:
1. Buffer and replay: focus a focusable pending state on Edit, collect printable input, and append it when the editor mounts. Nothing is lost. Escape and Mod-Enter need meanings during the wait. It is hand-rolled input beside CodeMirror.
2. Preload the editor on Open or on selection: the window shrinks but does not close on a cold load. This contradicts the existing test that no editor chunk loads before Edit, so ADR 0063's loading policy would be restated.
3. A focusable "Loading editor…" state that holds focus: the wait is honest, but the keys are still lost.
4. Accept it as designed and record that in ADR 0063 or the UI guide.

Also check whether any canvas or global shortcut reacts to letters or Space while focus sits on the body during the wait.

- [ ] A decision is recorded (ADR or UI guide).
- [ ] If an option that keeps the keys is chosen (1), the delayed-chunk spec is restored and passes.
- [ ] If an option that loses them is chosen (2 on a cold load, 3 or 4), the decision says what a key typed during the wait does, and the spec is restored asserting that instead of the typed text appearing.

## Reproduction spec

```ts
import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { nodeByTitle, resourceControls, selectCanvas, settled } from './graph';

/**
 * Keys typed the moment Edit is pressed belong to the draft, even while the
 * lazily loaded editor (ADR 0063, ADR 0067) is still arriving.
 *
 * The editor's chunk is held back so the window between Edit and an editable
 * editor is wide enough to type into on every run, rather than only on a cold
 * dev-server load.
 */
const EDITOR_CHUNK_DELAY_MS = 1500;

function controls(resource: Locator): Promise<Locator> {
  return resourceControls(resource.page(), resource);
}

test('keys typed straight after Edit, before the editor has loaded, reach the draft', async ({
  page,
}) => {
  await page.route(/MarkdownSourceEditor/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, EDITOR_CHUNK_DELAY_MS));
    await route.continue();
  });

  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await expect(resource).toBeVisible();
  await settled(page);

  await (await controls(resource)).getByRole('button', { name: 'Open Resource A' }).click();
  await expect(resource).toContainText('entry point');

  await (await controls(resource)).getByRole('button', { name: 'Edit Resource A' }).click();
  await page.keyboard.type('Typed at once');

  const source = page.getByRole('textbox', { name: 'Markdown source of A' });
  await expect(source).toContainText('entry point');
  await expect(source).toContainText('Typed at once');
});
```
