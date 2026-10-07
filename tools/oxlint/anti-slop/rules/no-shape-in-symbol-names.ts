import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const FORBIDDEN_SYMBOL_NAME = "shape";

/**
 * A name's words, lowercased: split at `_`, `-` and whitespace, and at each
 * camel-case boundary, so `GraphHeadShape`, `graphHeadShape` and
 * `GRAPH_HEAD_SHAPE` all read as `graph head shape`.
 */
function wordsOf(name: string): readonly string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

/**
 * Whether `compound` is spelled by `words` starting at `start`: every word
 * equal, except that the last may carry a plural `s`.
 */
function compoundAt(
  words: readonly string[],
  start: number,
  compound: readonly string[],
): boolean {
  return compound.every((expected, offset) => {
    const actual = words[start + offset];
    if (actual === undefined) return false;
    return (
      actual === expected ||
      (offset === compound.length - 1 && actual === `${expected}s`)
    );
  });
}

/**
 * Whether an identifier is written where it names a property rather than a
 * binding: an object literal's or a destructuring pattern's key, a member
 * access's property, a type or interface member, or a JSX attribute. A
 * shorthand destructuring key also binds a local of the same name, so it is
 * not one.
 */
function namesProperty(node: ESTree.Node): boolean {
  const { parent } = node;
  switch (parent?.type) {
    case "Property":
      return (
        parent.key === node &&
        !parent.computed &&
        !(parent.shorthand && parent.parent.type === "ObjectPattern")
      );
    case "MemberExpression":
      return parent.property === node && !parent.computed;
    case "TSPropertySignature":
      return parent.key === node && !parent.computed;
    case "JSXAttribute":
      return parent.name === node;
    default:
      return false;
  }
}

function containsForbiddenSymbolName(
  name: string,
  allowedCompounds: readonly (readonly string[])[],
  allowedName: boolean,
): boolean {
  if (!name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME)) return false;
  if (allowedName) return false;
  const words = wordsOf(name);
  const allowed = new Set<number>();
  words.forEach((_, start) => {
    for (const compound of allowedCompounds) {
      if (!compoundAt(words, start, compound)) continue;
      compound.forEach((__, offset) => allowed.add(start + offset));
    }
  });
  return words.some(
    (word, index) => !allowed.has(index) && word.includes(FORBIDDEN_SYMBOL_NAME),
  );
}

/** The configured compounds, each as its words. */
function allowedCompoundsOption(option: unknown): readonly (readonly string[])[] {
  if (typeof option !== "object" || option === null || !("allowedCompounds" in option)) {
    return [];
  }
  const { allowedCompounds } = option;
  if (!Array.isArray(allowedCompounds)) return [];
  const entries: readonly unknown[] = allowedCompounds;
  return entries.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const words = wordsOf(entry);
    return words.length === 0 ? [] : [words];
  });
}

/** The configured whole names, each matched exactly and only where it names a property. */
function allowedNamesOption(option: unknown): ReadonlySet<string> {
  if (typeof option !== "object" || option === null || !("allowedNames" in option)) {
    return new Set();
  }
  const { allowedNames } = option;
  if (!Array.isArray(allowedNames)) return new Set();
  const entries: readonly unknown[] = allowedNames;
  return new Set(entries.filter((entry): entry is string => typeof entry === "string"));
}

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
    },
    messages: {
      forbiddenSymbolName:
        'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedCompounds: { type: "array", items: { type: "string" } },
          allowedNames: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowedCompounds: [], allowedNames: [] }],
  },
  createOnce(context) {
    let allowedCompounds: readonly (readonly string[])[] = [];
    let allowedNames: ReadonlySet<string> = new Set();

    const reportForbiddenSymbolName = (node: ESTree.Node & { name: string }) => {
      const allowedName = allowedNames.has(node.name) && namesProperty(node);
      if (!containsForbiddenSymbolName(node.name, allowedCompounds, allowedName)) return;
      context.report({
        node,
        messageId: "forbiddenSymbolName",
        data: { name: node.name },
      });
    };

    return {
      before() {
        allowedCompounds = allowedCompoundsOption(context.options?.[0]);
        allowedNames = allowedNamesOption(context.options?.[0]);
      },
      Identifier: reportForbiddenSymbolName,
      PrivateIdentifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
    };
  },
});
