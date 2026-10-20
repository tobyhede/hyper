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
 * path label. Each file lists the trimmed source line of every one it holds,
 * once per occurrence, so a new one fails until it is read and listed here, one
 * that goes fails naming the line that went, and a line swapped for one that
 * names the kind fails although the number of them is unchanged.
 */
const NOT_THE_KIND = new Map<string, ReadonlyMap<string, readonly string[]>>([
  [
    'space',
    new Map([
      [
        'packages/app/src/components/ResourcesPopover.tsx',
        [
          "row: { kind: 'space' as const, space },",
          "data-space-id={row.kind === 'space' ? row.space.id : undefined}",
        ],
      ],
      ['packages/app/src/destination-opening.ts', ["if (destination.kind === 'space') {"]],
      [
        'packages/app/src/mount/mounted-startup.ts',
        ["const meta = productDestinationPath({ kind: 'space', spaceId: metaSpaceId });"],
      ],
      [
        'packages/app/src/dock-chrome.ts',
        ["onCopyLink: runEntityCommand({ kind: 'space' }, COPY_LINK_ACTION_ID),"],
      ],
      [
        'packages/app/src/entity-actions.tsx',
        [
          "| { readonly kind: 'space' }",
          "| { readonly kind: 'space' }",
          "if (entity.kind === 'space') {",
          "return [[], [copy(COPY_LINK_ACTION_ID, COPY_LINK, { kind: 'space', spaceId }, onCopy)], []];",
          "{ kind: 'space', spaceId: targetSpaceId },",
          "onOpenIndependently({ kind: 'space', spaceId: targetSpaceId })",
        ],
      ],
      [
        'packages/app/src/resource-placement.ts',
        ["resourcesDrag.current = { kind: 'space', space, mapId, settle };"],
      ],
      [
        'packages/app/src/resources-drag.ts',
        [
          "readonly kind: 'space';",
          "drag?.kind === 'space' && drag.space.id === spaceId && drag.mapId === mapId ? drag : null;",
        ],
      ],
      [
        'packages/http/src/product-destination.ts',
        [
          "| { readonly kind: 'space'; readonly spaceId: UUID }",
          "if (destination.kind === 'space') return space;",
          "if (segments.length === 3) return { kind: 'space', spaceId };",
        ],
      ],
      ['packages/ui/src/icons.tsx', ['data-icon="space"']],
      [
        'packages/aggregate/src/identify-space.ts',
        [".map((issue) => `${issue.path.join('.') || 'space'} ${issue.message.toLowerCase()}`)"],
      ],
      ['packages/aggregate/src/space-host.ts', ["kind: 'space',"]],
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

const scannedOutsideKinds = (): readonly string[] =>
  trackedFiles().filter((file) => isScannedSource(file) && !isKindModule(file));

/** Each line, trimmed, once per index in `at`, in source order, with its line number. */
const linesAt = (
  source: string,
  at: readonly number[],
): readonly { readonly line: number; readonly text: string }[] => {
  const lines = source.split('\n');
  return at.map((index) => {
    const line = lineAt(source, index);
    return { line, text: (lines[line - 1] ?? '').trim() };
  });
};

/**
 * Each file whose lines at `at`'s matches are not exactly the lines `listed`
 * names, as a multiset: one found but not listed fails naming its file and
 * line, and one listed but not found fails naming its file and text.
 */
const unlisted = (
  files: readonly string[],
  listed: ReadonlyMap<string, readonly string[]>,
  at: (source: string) => readonly number[],
  read: (file: string) => string,
): readonly string[] => {
  const tracked = new Set(files);
  return [...new Set([...files, ...listed.keys()])].flatMap((file) => {
    const source = tracked.has(file) ? read(file) : '';
    const remaining = [...(listed.get(file) ?? [])];
    const found = linesAt(source, at(source)).flatMap(({ line, text }) => {
      const match = remaining.indexOf(text);
      if (match === -1) return [`${file}:${line}: not listed: ${text}`];
      remaining.splice(match, 1);
      return [];
    });
    return [...found, ...remaining.map((text) => `${file}: listed, not found: ${text}`)];
  });
};

const namings = (kind: string): readonly string[] =>
  unlisted(
    scannedOutsideKinds(),
    NOT_THE_KIND.get(kind) ?? new Map(),
    (source) => quotedAt(source, kind),
    sourceOf,
  );

/**
 * Code outside a `kinds/` module that reaches one kind through its module's id,
 * by file. A choice among kinds goes through a registry: the core's
 * (`packages/core/src/kinds/registry.ts`), the view halves'
 * (`packages/ui/src/kinds/registry.ts`) or the application's canvas
 * decorations (`packages/app/src/kinds/registry.ts`). What is counted here is
 * a feature that exists for one kind and acts on that kind's own content, so a
 * new one, or a dispatch written with module ids, fails until it is read and
 * either routed or counted.
 *
 * The list only shrinks. Each file lists the trimmed source line of every
 * reach, once per occurrence, so a reach that goes fails until its line comes
 * off the list, a reach swapped for another fails although the number of them
 * is unchanged, and a new entry needs a ticket under
 * `.scratch/resource-kind-modules/`.
 */
const ONE_KIND_FEATURES = new Map<string, readonly string[]>([
  // A Markdown body's completion.
  [
    'packages/app/src/canvas-resource-authoring.ts',
    ["if (stored?.document.kind !== markdownKind.id) return 'retained';"],
  ],
  // The Space glyph on the Space cluster's own controls.
  [
    'packages/app/src/components/CommandDockSpaces.tsx',
    [
      '<ResourceKindIcon kind={spaceKind.id} decorative />',
      'icon={<ResourceKindIcon kind={spaceKind.id} decorative />}',
    ],
  ],
  // Replace is an Image Resource's (ADR 0106).
  [
    'packages/app/src/image-replacement.ts',
    ['if (stored?.document.kind !== imageKind.id) return undefined;'],
  ],
  // Create Reference's glyph, and a Space Resource's Enter and menu.
  [
    'packages/app/src/resource-rail-actions.tsx',
    [
      'icon: <ResourceKindIcon kind={referenceKind.id} decorative />,',
      'if (resource.kind === spaceKind.id) {',
      'spaces === null || resource.kind !== spaceKind.id',
    ],
  ],
  // Creating an Image or a Reference Resource, and Replace.
  [
    'packages/app/src/space-authoring.ts',
    [
      'return { title, kind: imageKind.id, content };',
      'if (resource.document.kind !== imageKind.id)',
      'kind: referenceKind.id,',
    ],
  ],
  // The Space Resource lifecycle (ADR 0074): its create.
  ['packages/persistence/src/space-resource-planning.ts', ['kind: spaceKind.id,']],
  // A stored image's bytes travel with the Image Resource that references it (ADR 0118).
  [
    'src/aggregate-directory/images.ts',
    [
      'const id = document.kind === imageKind.id ? storedImageId(document.content.url) : undefined;',
    ],
  ],
]);

const KIND_MODULE_IDS = new RegExp(`\\b(?:${KINDS.join('|')})Kind\\.id\\b`, 'gu');

/** Each index in `source` at which a kind is reached through its module's id. */
const moduleIdsAt = (source: string): readonly number[] =>
  [...source.matchAll(KIND_MODULE_IDS)].map((match) => match.index);

const moduleIdReaches = (): readonly string[] =>
  unlisted(
    scannedOutsideKinds().filter((file) => !file.endsWith('.css')),
    ONE_KIND_FEATURES,
    moduleIdsAt,
    sourceOf,
  );

describe('a kind is named only by its module', () => {
  it.each(KINDS)('names %s nowhere outside a kinds/ module', (kind) => {
    expect(namings(kind)).toEqual([]);
  });

  it('reaches a kind through its module only where one kind offers a feature of its own', () => {
    expect(moduleIdReaches()).toEqual([]);
  });

  it('fails a line that is not the kind swapped for one that is, and names both', () => {
    const listed = new Map([['a.ts', ["if (destination.kind === 'space') {"]]]);
    const swapped = "const a = 1;\nif (resource.kind === 'space') {\n";
    expect(
      unlisted(
        ['a.ts'],
        listed,
        (source) => quotedAt(source, 'space'),
        () => swapped,
      ),
    ).toEqual([
      "a.ts:2: not listed: if (resource.kind === 'space') {",
      "a.ts: listed, not found: if (destination.kind === 'space') {",
    ]);
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
