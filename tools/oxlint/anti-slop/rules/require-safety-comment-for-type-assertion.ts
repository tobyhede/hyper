import { defineRule } from "@oxlint/plugins";

import type { Comment, ESTree, SourceCode } from "@oxlint/plugins";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const commentOwnerKinds = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
]);

/**
 * A comment cannot be checked for truth, only for a stock admission that it
 * isn't one — this is a targeted backstop against exactly that admission
 * (`SAFETY: unverified here, but …`), not a general safety-content checker.
 */
const admitsAssertionIsUnverified = /\bunverified\b/iu;

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === "TSTypeReference" &&
    node.typeAnnotation.typeName.type === "Identifier" &&
    node.typeAnnotation.typeName.name === "const"
  );
}

function nearestSafetyComment(sourceCode: SourceCode, node: TypeAssertion): Comment | null {
  let current: ESTree.Node = node;
  while (true) {
    const comment = sourceCode
      .getCommentsBefore(current)
      .find((candidate) => candidate.end <= node.start && /\bSAFETY\s*:/u.test(candidate.value));
    if (comment !== undefined) return comment;
    if (commentOwnerKinds.has(current.type) || current.parent.type === "Program") return null;
    current = current.parent;
  }
}

/** Require every non-const type assertion to state the invariant TypeScript cannot express. */
export const requireSafetyCommentForTypeAssertionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a nearby SAFETY comment for every TypeScript type assertion except const assertions.",
    },
    messages: {
      missingSafetyComment:
        "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion or its containing statement.",
      selfUnderminingSafetyComment:
        "This assertion's `SAFETY:` comment admits it is unverified. State the checked invariant, or remove the assertion if none exists.",
    },
  },
  createOnce(context) {
    const checkAssertion = (node: TypeAssertion) => {
      if (isConstAssertion(node)) return;
      const comment = nearestSafetyComment(context.sourceCode, node);
      if (comment === null) {
        context.report({ node, messageId: "missingSafetyComment" });
      } else if (admitsAssertionIsUnverified.test(comment.value)) {
        context.report({ node, messageId: "selfUnderminingSafetyComment" });
      }
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
