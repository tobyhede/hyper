import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { maskedTsSource, scannedTsFiles } from '../support/structural-scan';

/**
 * The Command Dock and a Resource's own commands are **one surface drawn twice**.
 *
 * `.scratch/command-dock/issues/12` asks for a Resource's hover toolbar to read as
 * the Dock does, and says in as many words that copying the Dock's stylesheet
 * into the Resource's does not answer it. That is not a claim a rendering test can
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
const resourceSheet = read('packages/ui/src/canvas-resource.css');
const railSheet = read('packages/ui/src/resource-rail.css');
const dock = read('packages/app/src/components/CommandDock.tsx');
const canvasCommandToolbar = read('packages/ui/src/CanvasCommandToolbar.tsx');
const resourceRailActions = read('packages/ui/src/ResourceRailActions.tsx');
const edgeToolbar = read('packages/ui/src/EdgeToolbar.tsx');
const spaceResourceSelectors = read('packages/ui/src/SpaceResourceSelectors.tsx');
const spaceResourceRail = read('packages/app/src/build-space-resource-rail.tsx');
const canvasResource = read('packages/ui/src/CanvasResource.tsx');

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
   * later gets the treatment by mounting the resource rather than by remembering a
   * string.
   */
  it('is mounted by both the Command Dock and the canvas command toolbar', () => {
    expect(dock).toContain('<CommandToolbar');
    expect(canvasCommandToolbar).toContain('<CommandToolbar');
  });

  /**
   * And neither has taken a copy back. The Dock's own sheet still owns its
   * twelve slots, its cap and what a drag does to it; the Resource's still owns
   * where its toolbar sits in the band. Neither may own the panel.
   */
  it.each([
    { name: 'the Command Dock', stylesheet: dockSheet, selector: '.command-dock__surface' },
    { name: 'a Resource rail', stylesheet: resourceSheet, selector: '.canvas-resource__actions' },
  ])('leaves $name declaring none of the treatment itself', ({ stylesheet, selector }) => {
    const declarations = block(stylesheet, selector);

    for (const property of TREATMENT) {
      expect(declarations, `${selector} declares ${property} of its own`).not.toMatch(
        new RegExp(String.raw`(?<![\w-])${property}:`, 'u'),
      );
    }
  });
});

describe('a toolbar drawn on the canvas', () => {
  /**
   * Every toolbar over the canvas mounts `CanvasCommandToolbar`, not the bare
   * surface: without its keydown stop, arrow keys reach React Flow.
   */
  const CANVAS_TOOLBARS = [
    { name: 'a Resource rail', source: resourceRailActions },
    { name: "an Edge's toolbar", source: edgeToolbar },
  ] as const;

  it.each(CANVAS_TOOLBARS)('is what $name mounts', ({ source }) => {
    expect(source).toContain('<CanvasCommandToolbar');
    expect(source).not.toContain('<CommandToolbar');
  });

  /** The Dock floats beside the canvas, not on it, so it alone may mount the surface directly. */
  it('is the only way onto the shared surface besides the Command Dock', () => {
    const mounting = scannedTsFiles().filter((file) =>
      maskedTsSource(file).includes('<CommandToolbar'),
    );

    expect(mounting).toEqual([
      'packages/app/src/components/CommandDock.tsx',
      'packages/ui/src/CanvasCommandToolbar.tsx',
    ]);
  });
});

describe('the Resource rail', () => {
  /**
   * **The band is neutral, and that is the requested change** (issue 12). It
   * carried the Active Graph's colour; what a Resource reveals is a command strip,
   * and a strip of commands is chrome, so it is drawn as chrome is everywhere
   * else. The colour has not left the canvas — the authoring handles are
   * painted `activeGraphColor` by `ResourceNode` and each Graph's Edges are drawn in
   * its own — which is where a colour that says *which Graph* belongs.
   */
  it('paints no background of its own', () => {
    expect(railSheet).not.toMatch(/(?<![\w-])background(-color)?:/u);
    expect(railSheet).not.toContain('--resource-rail-graph');
  });

  /** And no Resource puts one back behind the strip. */
  it('is not banded by the Resource that mounts it either', () => {
    const railRules = [
      ...resourceSheet.matchAll(/\.(?:canvas-)?resource(?:-|__)rail[^{]*\{([^}]*)\}/gu),
    ].map((found) => found[1] ?? '');

    expect(railRules.length).toBeGreaterThan(0);
    for (const declarations of railRules) {
      expect(declarations).not.toMatch(/(?<![\w-])background(-color)?:/u);
    }
  });
});

describe('choosing a Map or a Graph', () => {
  /**
   * One composition for the two surfaces that ask the same question.
   *
   * The Dock's Map and Graph clusters and an Open Space Resource's two choices
   * are the same control over the same kind of set — and deliberately not the
   * same *operation*: one moves the canvas the author is standing on, the other
   * writes which Map a Resource shows into that Resource. `ChoiceMenu` is the half
   * that is shared, and it takes the set, the selection and the operation from
   * whoever draws it.
   */
  it('is the same shared menu on the Dock and on a Space Resource', () => {
    expect(dock).toContain('<ChoiceMenu<MapId>');
    expect(dock).toContain('<ChoiceMenu<GraphId>');
    expect(spaceResourceSelectors).toContain('<ChoiceMenu<string>');
  });

  /**
   * And an Open Space Resource's two choices are themselves **one** control,
   * mounted by both surfaces that draw them, rather than a control copied
   * twice: `@project/ui`'s `SpaceResourceSelectors` is the sole place a Map or
   * Graph choice is turned into a `ChoiceMenu`, an embedded canvas Resource's own
   * rail (`CanvasResource`) and the application's Space Resource rail
   * (`buildSpaceResourceRail`) each mount it rather than restating it.
   */
  it('is owned once by @project/ui, not copied onto the canvas Resource or the app rail', () => {
    expect(spaceResourceRail).toContain("from '@project/ui'");
    expect(spaceResourceRail).not.toContain('<ChoiceMenu');
    expect(spaceResourceRail).not.toMatch(/function SpaceResourceSelector/u);

    expect(canvasResource).toContain("from './SpaceResourceSelectors'");
    expect(canvasResource).not.toContain('<ChoiceMenu');
    expect(canvasResource).not.toMatch(/function SpaceResourceSelector/u);
  });
});
