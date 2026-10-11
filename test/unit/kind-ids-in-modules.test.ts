import { describe, expect, it } from 'vitest';
import { lineAt, maskedCssSource, maskedTsSource, trackedFiles } from '../support/structural-scan';

/**
 * ADR 0128: every Resource kind is a module, and no rule outside it names the
 * kind. A kind is named, as a quoted id in source or a CSS attribute selector,
 * only under a `kinds/` directory; everything else reaches it through the
 * module's exports. A quoted id is held to `NOT_THE_KIND`, and a module's id to
 * `ONE_KIND_FEATURES`; an unquoted object key is not read, since every table
 * over the kinds is a registry's, typed over every kind.
 */
const KINDS = ['ur', 'image', 'markdown', 'reference', 'space'] as const;

/**
 * Quoted ids that are not the kind: `'space'` also tags a Space itself, as an
 * entity, a product destination, a Resources-list row, a drag, an icon and a
 * path label. Each file lists how many it holds, so a new one fails until it
 * is read and counted here.
 */
const NOT_THE_KIND = new Map<string, ReadonlyMap<string, number>>([
  [
    'space',
    new Map([
      ['packages/app/src/components/ResourcesPopover.tsx', 2],
      ['packages/app/src/destination-opening.ts', 1],
      ['packages/app/src/dock-chrome.ts', 1],
      ['packages/app/src/entity-actions.tsx', 6],
      ['packages/app/src/resource-placement.ts', 1],
      ['packages/app/src/resources-drag.ts', 2],
      ['packages/http/src/product-destination.ts', 3],
      ['packages/ui/src/icons.tsx', 1],
      ['src/aggregate-directory/identify-space.ts', 1],
      ['src/http/space-host.ts', 1],
    ]),
  ],
]);

/** Source the application, the hosts and the CLI are built from; tests and stories are not. */
const isScannedSource = (file: string): boolean =>
  /^(?:packages\/[^/]+\/src|src)\/.*\.(?:tsx?|css)$/u.test(file);

const isKindModule = (file: string): boolean => file.includes('/kinds/');

const sourceOf = (file: string): string =>
  file.endsWith('.css') ? maskedCssSource(file) : maskedTsSource(file);

/** Each index in `source` at which `kind` is written as a quoted string. */
const quotedAt = (source: string, kind: string): readonly number[] =>
  [...source.matchAll(new RegExp(`(['"\`])${kind}\\1`, 'gu'))].map((match) => match.index);

const namings = (kind: string): readonly string[] =>
  trackedFiles()
    .filter((file) => isScannedSource(file) && !isKindModule(file))
    .flatMap((file) => {
      const source = sourceOf(file);
      const lines = quotedAt(source, kind).map((index) => `${file}:${lineAt(source, index)}`);
      return lines.length === (NOT_THE_KIND.get(kind)?.get(file) ?? 0) ? [] : lines;
    });

/**
 * Code outside a `kinds/` module that reaches one kind through its module's id,
 * by file. A choice among kinds goes through a registry: the core's
 * (`packages/core/src/kinds/registry.ts`), the view halves'
 * (`packages/ui/src/kinds/registry.ts`) or the application's canvas
 * decorations (`packages/app/src/kinds/registry.ts`). What is counted here is
 * a feature that exists for one kind and acts on that kind's own content, so a
 * new one, or a dispatch written with module ids, fails until it is read and
 * either routed or counted.
 */
const ONE_KIND_FEATURES = new Map<string, number>([
  // The closed union `content` is still typed by (ADR 0128, "bar content's type").
  ['packages/core/src/schema.ts', 10],
  // A Space Resource's selection, framing and portal; a Markdown body's completion.
  ['packages/app/src/canvas-resource-authoring.ts', 4],
  // An Image Resource's Create opens the file picker first (ADR 0106).
  ['packages/app/src/components/CommandDockResources.tsx', 2],
  // The Space glyph on the Space cluster's own controls.
  ['packages/app/src/components/CommandDockSpaces.tsx', 2],
  // The kinds the Create cluster offers, in its order (ADR 0089).
  ['packages/app/src/components/command-dock-chrome.ts', 4],
  // A Space Resource's Create runs the Space Resource lifecycle (ADR 0074).
  ['packages/app/src/dock-chrome.ts', 1],
  // Replace is an Image Resource's (ADR 0106).
  ['packages/app/src/image-replacement.ts', 1],
  // Create Reference's glyph, and a Space Resource's Enter and menu.
  ['packages/app/src/resource-rail-actions.tsx', 3],
  // Creating an Image or a Reference Resource, and Replace.
  ['packages/app/src/space-authoring.ts', 3],
  // The Space Resources that reference an entry of this Meta Space.
  ['packages/app/src/space-resource-targets.ts', 1],
  // The Space Resource lifecycle (ADR 0074).
  ['packages/persistence/src/space-resource-planning.ts', 4],
  ['src/persistence/sql-space-repository.ts', 2],
  // A stored image's bytes travel with the Image Resource that references it (ADR 0118).
  ['src/aggregate-directory/images.ts', 1],
]);

const KIND_MODULE_IDS = new RegExp(`\\b(?:${KINDS.join('|')})Kind\\.id\\b`, 'gu');

/** Each index in `source` at which a kind is reached through its module's id. */
const moduleIdsAt = (source: string): readonly number[] =>
  [...source.matchAll(KIND_MODULE_IDS)].map((match) => match.index);

const moduleIdReaches = (): readonly string[] =>
  trackedFiles()
    .filter((file) => isScannedSource(file) && !isKindModule(file) && !file.endsWith('.css'))
    .flatMap((file) => {
      const source = sourceOf(file);
      const lines = moduleIdsAt(source).map((index) => `${file}:${lineAt(source, index)}`);
      return lines.length === (ONE_KIND_FEATURES.get(file) ?? 0) ? [] : lines;
    });

describe('a kind is named only by its module', () => {
  it.each(KINDS)('names %s nowhere outside a kinds/ module', (kind) => {
    expect(namings(kind)).toEqual([]);
  });

  it('reaches a kind through its module only where one kind offers a feature of its own', () => {
    expect(moduleIdReaches()).toEqual([]);
  });

  it('finds a module id, and not a longer name', () => {
    expect(moduleIdsAt('a === urKind.id; b(spaceKind.id); c = spaceKind.idle')).toHaveLength(2);
  });

  it('finds a kind id in any quote, and not a longer word', () => {
    const source = "a === 'ur'; b(\"ur\"); c = `ur`; d('urn', 'our')";
    expect(quotedAt(source, 'ur')).toHaveLength(3);
  });

  it('reads source in the kinds/ directories as module source', () => {
    expect(isKindModule('packages/core/src/kinds/ur.ts')).toBe(true);
    expect(isKindModule('packages/core/src/schema.ts')).toBe(false);
  });
});
