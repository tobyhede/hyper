import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Command Dock and a Thing's own commands are **one surface drawn twice**.
 *
 * `.scratch/command-dock/issues/12` asks for a Thing's hover toolbar to read as
 * the Dock does, and says in as many words that copying the Dock's stylesheet
 * into the Thing's does not answer it. That is not a claim a rendering test can
 * make: two stylesheets that happen to declare the same nine properties draw
 * exactly the same picture as one stylesheet mounted twice, and only the second
 * stays true after the next change to either surface.
 *
 * So the invariant is read off the source. What it holds is *ownership*: the
 * treatment is declared in one place, both surfaces mount the component that
 * wears it, and neither has quietly taken a copy back.
 */

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const sharedSheet = read('packages/ui/src/command-surface.css');
const dockSheet = read('packages/app/src/components/command-dock.css');
const thingSheet = read('packages/ui/src/canvas-thing.css');
const railSheet = read('packages/ui/src/thing-rail.css');
const dock = read('packages/app/src/components/CommandDock.tsx');
const thingRailActions = read('packages/ui/src/ThingRailActions.tsx');
const canvasThing = read('packages/ui/src/CanvasThing.tsx');

/** The declaration block of the rule whose selector is exactly `selector`. */
const block = (stylesheet: string, selector: string): string => {
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, String.raw`\$&`);
  const found = new RegExp(String.raw`^${escaped}\s*\{([^}]*)\}`, 'mu').exec(stylesheet);
  expect(found, `no rule for ${selector}`).not.toBeNull();
  return found?.[1] ?? '';
};

/**
 * What makes the surface the surface: the panel a reader sees, rather than
 * where it sits or how large it may grow, which stay each surface's own.
 */
const TREATMENT = [
  'padding',
  'gap',
  'border',
  'border-radius',
  'background',
  'box-shadow',
  'backdrop-filter',
] as const;

describe('the shared command surface', () => {
  it('declares the whole treatment in one place', () => {
    const surface = block(sharedSheet, '.command-surface');

    for (const property of TREATMENT) {
      expect(surface, `${property} is not declared on .command-surface`).toMatch(
        new RegExp(String.raw`(?<![\w-])${property}:`, 'u'),
      );
    }
  });

  /**
   * The two surfaces that wear it, each named where it is mounted.
   *
   * A `className` would not do: the point of the component is that the axis
   * reaches Base UI and the stylesheet from one value, and that a surface added
   * later gets the treatment by mounting the thing rather than by remembering a
   * string.
   */
  it('is mounted by both the Command Dock and a Thing rail', () => {
    expect(dock).toContain('<CommandToolbar');
    expect(thingRailActions).toContain('<CommandToolbar');
  });

  /**
   * And neither has taken a copy back. The Dock's own sheet still owns its
   * twelve slots, its cap and what a drag does to it; the Thing's still owns
   * when its commands are revealed. Neither may own the panel.
   */
  it.each([
    { name: 'the Command Dock', stylesheet: dockSheet, selector: '.command-dock__surface' },
    { name: 'a Thing rail', stylesheet: thingSheet, selector: '.canvas-thing__actions' },
  ])('leaves $name declaring none of the treatment itself', ({ stylesheet, selector }) => {
    const declarations = block(stylesheet, selector);

    for (const property of TREATMENT) {
      expect(declarations, `${selector} declares ${property} of its own`).not.toMatch(
        new RegExp(String.raw`(?<![\w-])${property}:`, 'u'),
      );
    }
  });
});

describe('the Thing rail', () => {
  /**
   * **The band is neutral, and that is the requested change** (issue 12). It
   * carried the Active Graph's colour; what a Thing reveals is a command strip,
   * and a strip of commands is chrome, so it is drawn as chrome is everywhere
   * else. The colour has not left the canvas — the authoring handles are
   * painted `activeGraphColor` by `ThingNode` and each Graph's Edges are drawn in
   * its own — which is where a colour that says *which Graph* belongs.
   */
  it('paints no background of its own', () => {
    expect(railSheet).not.toMatch(/(?<![\w-])background(-color)?:/u);
    expect(railSheet).not.toContain('--thing-rail-graph');
  });

  /** And no Thing puts one back behind the strip. */
  it('is not banded by the Thing that mounts it either', () => {
    const railRules = [...thingSheet.matchAll(/\.thing-rail[^{]*\{([^}]*)\}/gu)].map(
      (found) => found[1] ?? '',
    );

    expect(railRules.length).toBeGreaterThan(0);
    for (const declarations of railRules) {
      expect(declarations).not.toMatch(/(?<![\w-])background(-color)?:/u);
    }
  });
});

describe('choosing a Diagram or a Graph', () => {
  /**
   * One composition for the two surfaces that ask the same question.
   *
   * The Dock's Diagram and Graph clusters and an Open Space Thing's two choices
   * are the same control over the same kind of set — and deliberately not the
   * same *operation*: one moves the canvas the author is standing on, the other
   * writes which Diagram a Thing shows into that Thing. `ChoiceMenu` is the half
   * that is shared, and it takes the set, the selection and the operation from
   * whoever draws it.
   */
  it('is the same shared menu on the Dock and on a Space Thing', () => {
    expect(dock).toContain('<ChoiceMenu<DiagramId>');
    expect(dock).toContain('<ChoiceMenu<GraphId>');
    expect(canvasThing).toContain('<ChoiceMenu<string>');
  });
});
