import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { KEY_BINDINGS } from '../key-bindings';

const repoRoot = join(import.meta.dirname, '../..');
const sourceRoots = ['packages/app/src', 'packages/ui/src'] as const;

interface DiscoveredBinding {
  readonly module: string;
  readonly sourceKey: string;
  readonly position: number;
}

const sourcesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      ? [path]
      : [];
  });

/**
 * Whether a name reads as a keyboard event rather than some other record.
 *
 * The scan used to require the literal `event`, which made the ratchet a check
 * on one spelling instead of on the binding: `e.key === 'Delete'` added an
 * unlisted key and left this test green. Any identifier may carry `.key`,
 * because a `.key` compared against a string literal is a key binding whatever
 * the parameter is called. `.code` is narrower on purpose — `refusal.code` and
 * its kin are domain identities (ADR 0057), not keystrokes — so it is read only
 * off a name that already reads as an event.
 */
const readsAsEvent = (name: string): boolean => /^e([a-z]*)$/i.test(name) || /event/i.test(name);

const isEventKey = (node: ts.Node): boolean => {
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return false;
  if (node.name.text === 'key') return true;
  return node.name.text === 'code' && readsAsEvent(node.expression.text);
};

/**
 * `({ key }) => key === 'Backspace'` is the same binding, destructured.
 *
 * No source in the scanned trees names a non-event local `key`, so a bare one
 * compared against a string literal is a keystroke read every time it appears.
 */
const isDestructuredKey = (node: ts.Node): boolean =>
  ts.isIdentifier(node) && (node.text === 'key' || node.text === 'eventKey');

const containsEventKey = (node: ts.Node): boolean => {
  if (isEventKey(node) || isDestructuredKey(node)) return true;
  let found = false;
  node.forEachChild((child) => {
    if (containsEventKey(child)) found = true;
  });
  return found;
};

const stringValues = (
  expression: ts.Expression,
  stringConstants: ReadonlyMap<string, string>,
): readonly string[] => {
  if (ts.isStringLiteral(expression)) return [expression.text];
  if (ts.isIdentifier(expression)) {
    const value = stringConstants.get(expression.text);
    return value === undefined ? [] : [value];
  }
  return [];
};

const propertyKey = (property: ts.ObjectLiteralElementLike): string | null => {
  if (!ts.isPropertyAssignment(property)) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    return property.name.text;
  return null;
};

const discoverBindings = (path: string, source: string): readonly DiscoveredBinding[] => {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const module = relative(repoRoot, path);
  const stringConstants = new Map<string, string>();
  const expressionConstants = new Map<string, ts.Expression>();
  const found: DiscoveredBinding[] = [];

  const record = (sourceKey: string, position: number): void => {
    found.push({ module, sourceKey, position });
  };

  const collectConstants = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer)
    ) {
      stringConstants.set(node.name.text, node.initializer.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      expressionConstants.set(node.name.text, node.initializer);
    }
    node.forEachChild(collectConstants);
  };
  collectConstants(sourceFile);

  const bindingValues = (expression: ts.Expression): readonly string[] => {
    if (ts.isStringLiteral(expression)) return [expression.text];
    if (ts.isArrayLiteralExpression(expression))
      return expression.elements.flatMap((element) =>
        ts.isExpression(element) ? bindingValues(element) : [],
      );
    if (ts.isIdentifier(expression)) {
      const initializer = expressionConstants.get(expression.text);
      return initializer === undefined ? [] : bindingValues(initializer);
    }
    return [];
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const leftHasKey = containsEventKey(node.left);
      const rightHasKey = containsEventKey(node.right);
      if (leftHasKey !== rightHasKey) {
        const values = stringValues(leftHasKey ? node.right : node.left, stringConstants);
        for (const value of values) record(value, node.getStart(sourceFile));
      }
    }

    if (
      ts.isElementAccessExpression(node) &&
      isEventKey(node.argumentExpression) &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      for (const property of node.expression.properties) {
        const key = propertyKey(property);
        if (key !== null) record(key, property.getStart(sourceFile));
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(
        node.properties.flatMap((property) => {
          const key = propertyKey(property);
          return key === null || !ts.isPropertyAssignment(property) ? [] : [[key, property]];
        }),
      );
      const keymapKey = properties.get('key');
      if (keymapKey !== undefined && properties.has('run')) {
        for (const value of bindingValues(keymapKey.initializer))
          record(value, keymapKey.getStart(sourceFile));
      }
      for (const [key, property] of properties) {
        if (
          key.endsWith('KeyCode') &&
          !(ts.isIdentifier(property.initializer) && /(?:^|_)KEYS$/.test(property.initializer.text))
        ) {
          for (const value of bindingValues(property.initializer))
            record(value, property.getStart(sourceFile));
        }
      }
    }

    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith('KeyCode')
    ) {
      const initializer = node.initializer;
      const expression =
        initializer !== undefined && ts.isStringLiteral(initializer)
          ? initializer
          : initializer !== undefined &&
              ts.isJsxExpression(initializer) &&
              initializer.expression !== undefined
            ? initializer.expression
            : undefined;
      if (
        expression !== undefined &&
        !(ts.isIdentifier(expression) && /(?:^|_)KEYS$/.test(expression.text))
      ) {
        for (const value of bindingValues(expression)) record(value, node.getStart(sourceFile));
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      /(?:^|_)KEYS$/.test(node.name.text)
    ) {
      const [newSetArgument] = ts.isNewExpression(node.initializer)
        ? (node.initializer.arguments ?? [])
        : [];
      const values = ts.isArrayLiteralExpression(node.initializer)
        ? node.initializer.elements
        : newSetArgument !== undefined && ts.isArrayLiteralExpression(newSetArgument)
          ? newSetArgument.elements
          : [];
      for (const value of values) {
        if (ts.isStringLiteral(value)) record(value.text, value.getStart(sourceFile));
      }
    }

    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
};

const occurrenceIds = (bindings: readonly DiscoveredBinding[]): readonly string[] => {
  const seen = new Map<string, number>();
  return [...bindings]
    .sort((left, right) =>
      left.module === right.module
        ? left.position - right.position
        : left.module.localeCompare(right.module),
    )
    .map(({ module, sourceKey }) => {
      const subject = `${module}:${sourceKey}`;
      const occurrence = (seen.get(subject) ?? 0) + 1;
      seen.set(subject, occurrence);
      return `${subject}:${occurrence}`;
    });
};

describe('discoverBindings', () => {
  it('discovers a CodeMirror keymap entry by its key property', () => {
    const bindings = discoverBindings(
      join(repoRoot, 'packages/ui/src/example.ts'),
      `const keymap = [{ key: 'Escape', run: () => true }];`,
    );

    expect(bindings.map(({ sourceKey }) => sourceKey)).toEqual(['Escape']);
  });

  it('discovers inline React Flow KeyCode property and JSX values', () => {
    const bindings = discoverBindings(
      join(repoRoot, 'packages/app/src/example.tsx'),
      `
        const props = { deleteKeyCode: ['Backspace', 'Delete'] };
        const canvas = <ReactFlow panActivationKeyCode="Space" selectionKeyCode={'Shift'} />;
      `,
    );

    expect(bindings.map(({ sourceKey }) => sourceKey)).toEqual([
      'Backspace',
      'Delete',
      'Space',
      'Shift',
    ]);
  });
});

describe('the authored keyboard-binding inventory', () => {
  /**
   * A binding is a repository-authored key comparison, a keymap entry, or a
   * React Flow `*KeyCode` prop value in `packages/app/src` or `packages/ui/src`.
   * Primitive-internal handling is outside these trees and therefore out of
   * scope. Comments, documentation, `aria-keyshortcuts` and handlers that only
   * propagate an event do not bind a key and are not scanned.
   */
  it('names every live binding once and no binding that has disappeared', () => {
    const discovered = sourceRoots.flatMap((root) =>
      sourcesUnder(join(repoRoot, root)).flatMap((path) =>
        discoverBindings(path, readFileSync(path, 'utf8')),
      ),
    );
    expect(discovered.length).toBeGreaterThan(0);

    const actual = occurrenceIds(discovered);
    const inventoried = KEY_BINDINGS.map(
      ({ module, sourceKey, occurrence }) => `${module}:${sourceKey}:${occurrence}`,
    ).sort();

    expect([...actual].sort()).toEqual(inventoried);
  });
});
