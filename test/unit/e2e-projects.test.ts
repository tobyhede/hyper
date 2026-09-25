import { describe, expect, it } from 'vitest';
import rootManifest from '../../package.json';
import playwrightConfig from '../../playwright.config';

/**
 * `e2e:fixture` selects a Playwright project by name, and the name it asks for
 * is a literal in a JSON script that no compiler reads. `projects.ts` argues
 * correctly that this is safe — Playwright answers an unknown project by
 * failing outright, so nothing silently runs the wrong catalog — but "fails
 * loudly" there means at the end of an e2e run someone chose to start. Here it
 * is `pnpm verify`, before the rename is committed.
 *
 * Its sibling `NEW_SPACE_PROJECT` needs no such guard: that name is *compared*
 * in `fixtures.ts`, so it is already a shared constant rather than a copy.
 */

/** The name `--project=` asks for, or `undefined` if the script stopped naming
 *  one — which is itself a change this test should notice. */
function selectedProject(script: string): string | undefined {
  return /--project[= ](\S+)/.exec(script)?.[1];
}

/** Every project the config declares, in declaration order. A name is optional
 *  to Playwright — an unnamed project is legal and simply unselectable — so the
 *  gap is carried through rather than filtered away, and `--project=` naming one
 *  of those would fail the containment check as it should. */
function declaredProjects(): (string | undefined)[] {
  return (playwrightConfig.projects ?? []).map((project) => project.name);
}

describe('e2e:fixture project selection', () => {
  it('asks for a project the Playwright config declares', () => {
    const requested = selectedProject(rootManifest.scripts['e2e:fixture']);

    expect(requested).toBeTypeOf('string');
    expect(declaredProjects()).toContain(requested);
  });

  it('selects one of the projects rather than all of them', () => {
    // The whole point of the script is to run less than `pnpm e2e` does. A
    // config down to a single project would make it a synonym, and the
    // separation the README promises would be gone without the script changing.
    expect(declaredProjects().length).toBeGreaterThan(1);
  });
});
