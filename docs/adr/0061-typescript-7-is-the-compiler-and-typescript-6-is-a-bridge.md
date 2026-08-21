# TypeScript 7 is the compiler and TypeScript 6 is a bridge

Status: accepted
Related: 0054, 0056
Build status: not built

`tsc` is TypeScript 7 and its diagnostics are the only type-checking truth in this repository. `pnpm typecheck` and every package's own `typecheck` run that compiler, and a program TypeScript 7 accepts is a correct program whether or not an older compiler agrees.

TypeScript 7 does not expose the programmatic compiler API that `typescript-eslint` consumes, and `typescript-eslint` peers `typescript >=4.8.4 <6.1.0`. Typed linting is not optional here — `strictTypeChecked` and `stylisticTypeChecked` carry most of the `no-unsafe-*` family and every rule ADR 0062 adds. So the two are installed side by side under deliberately counterintuitive names: the package name `typescript` resolves to the TypeScript 6 compatibility API, exposing `tsc6` and the old `createProgram` surface for tooling, while TypeScript 7 is installed under a separate alias and owns the `tsc` binary. Nothing in this repository targets TypeScript 6, and no source change is made to satisfy it.

Because the arrangement reads as a mistake, it is asserted rather than described. A toolchain check runs ahead of typechecking in `verify` and fails unless the `tsc` the typecheck scripts actually execute reports major version 7 or above, and unless `import "typescript"` still answers the version and API surface the linter needs. A lockfile change, a dependency bump or a well-meaning cleanup that silently makes `tsc` resolve to TypeScript 6 must fail CI on the spot, not degrade into a weaker check nobody notices.

The bridge is temporary and its removal condition is written down: a stable TypeScript release exposes the replacement compiler API, `typescript-eslint` supports that major version, this repository's other programmatic consumers support it, and `pnpm verify` passes with the `typescript` name pointing directly at 7 or above. At that point the alias, the compatibility package, the `tsc6` assertions and this arrangement's commentary all go, and the permanent assertion narrows to *the authoritative `tsc` is 7 or above*.

We rejected waiting for `typescript-eslint`: the compiler is ready, the repository typechecks clean under it, and waiting means the migration lands later bundled with unrelated churn. We rejected dropping typed linting to install TypeScript 7 alone, because typed rules are the enforcement half of this codebase's typing policy and losing them to gain a compiler is a net loss. We rejected installing plain `typescript@7` beside `typescript-eslint` and ignoring the peer break, which produces a linter running against an API it was not built for and diagnostics nobody should trust. We rejected keeping TypeScript 6 as a second mandatory oracle: two compilers that must both agree makes the older one's limitations into repository policy, which is the outcome this decision exists to prevent.

The accepted cost is two TypeScript installations in the lockfile, a package name that means the opposite of what it says, and a check that must run before typechecking rather than being an implicit property of the install. A one-off comparison against `tsc6` remains useful while migrating and is not normative afterwards.

## The negative to remember

Do not "fix" the package names so that `typescript` means TypeScript 7 — that breaks typed linting, and the confusion is the price of the bridge. Do not change source code so an older compiler accepts it. Do not add a TypeScript 6 typecheck job, script or CI step. Do not point an editor's TypeScript 7 language service at `node_modules/typescript`, which is the compatibility package on purpose. Do not delete the toolchain assertion because the versions "obviously" resolve correctly; it exists precisely for the day they silently stop.
