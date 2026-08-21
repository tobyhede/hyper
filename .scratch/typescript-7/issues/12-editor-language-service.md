# 12 — Editor language service on TypeScript 7

**What to build:** Nothing.

**Status:** wontfix

**Why:** with the bridge in place, an editor resolving TypeScript from `node_modules/typescript` gets the 6.x compatibility package, so hovers, quick fixes and inline diagnostics come from the compiler ADR 0061 declares non-normative. The fix would be a committed `.vscode/` recommending the TypeScript 7 extension with `"js/ts.experimental.useTsgo": true`.

Declined. There is no `.vscode/` in this repository today, and adding committed editor configuration to solve a transitional problem creates surface that outlives the problem — the bridge goes away, the directory does not. `pnpm verify` is the arbiter regardless of what an editor reports, so the failure mode is confusion rather than a wrong result. Anyone bothered by it can set it locally.

**If this is revisited**, the one thing that must not happen is pointing the TypeScript 7 extension at `node_modules/typescript`. That path is the 6.x compatibility API on purpose, and aiming the new language service at it produces exactly the confusion the change would be trying to remove.
