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

function containsForbiddenSymbolName(
  name: string,
  allowedCompounds: readonly (readonly string[])[],
): boolean {
  if (!name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME)) return false;
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
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowedCompounds: [] }],
  },
  createOnce(context) {
    let allowedCompounds: readonly (readonly string[])[] = [];

    const reportForbiddenSymbolName = (node: ESTree.Node & { name: string }) => {
      if (!containsForbiddenSymbolName(node.name, allowedCompounds)) return;
      context.report({
        node,
        messageId: "forbiddenSymbolName",
        data: { name: node.name },
      });
    };

    return {
      before() {
        allowedCompounds = allowedCompoundsOption(context.options?.[0]);
      },
      Identifier: reportForbiddenSymbolName,
      PrivateIdentifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
    };
  },
});
