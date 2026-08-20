import type { ESTree } from "@oxlint/plugins";

export type Parameter = ESTree.ParamPattern;

export type ParameterOwner =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

/** Resolve a parameter's own type annotation through the wrappers a bare `Identifier` doesn't carry. */
export function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === "TSParameterProperty") {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

type ParameterOwnerNodeType =
	| "ArrowFunctionExpression"
	| "FunctionDeclaration"
	| "FunctionExpression"
	| "TSCallSignatureDeclaration"
	| "TSConstructSignatureDeclaration"
	| "TSConstructorType"
	| "TSDeclareFunction"
	| "TSEmptyBodyFunctionExpression"
	| "TSFunctionType"
	| "TSMethodSignature";

/** Every function-like AST node kind whose `params` a parameter rule must check. */
export function parameterOwnerVisitors(
	handler: (node: ParameterOwner) => void,
): Readonly<Record<ParameterOwnerNodeType, (node: ParameterOwner) => void>> {
	return {
		ArrowFunctionExpression: handler,
		FunctionDeclaration: handler,
		FunctionExpression: handler,
		TSCallSignatureDeclaration: handler,
		TSConstructSignatureDeclaration: handler,
		TSConstructorType: handler,
		TSDeclareFunction: handler,
		TSEmptyBodyFunctionExpression: handler,
		TSFunctionType: handler,
		TSMethodSignature: handler,
	};
}
