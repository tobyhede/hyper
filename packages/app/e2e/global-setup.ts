import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Throw away the space the `new-space` project writes, so every run starts from
 * a space the app has just minted rather than from whatever the last run left.
 *
 * That directory is the point of the project: `SPACE_DIR` names it, it does not
 * exist yet, and the first save brings it into being. Keeping it between runs
 * would make the first test's "one card, freshly minted" quietly depend on the
 * previous run having ended tidily.
 */
export default function globalSetup(): void {
  rmSync(fileURLToPath(new URL('../.space', import.meta.url)), { recursive: true, force: true });
}
