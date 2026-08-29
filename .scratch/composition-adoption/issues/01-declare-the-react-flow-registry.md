# 01 — Declare the React Flow registry to the shadcn CLI

**What to build:** `$shadcn-first-ui`'s second step — "then the shadcn registry" — reaches xyflow's canvas components. Today it cannot: neither shadcn manifest declares a `registries` field, so the search stops at the official registry and every canvas surface xyflow already ships arrives here as a hand-roll with no deviation recorded, because nobody was ever shown the component they were deviating from.

**Blocked by:** None (can start immediately).

**Status:** done

The namespaced entry, which is the whole change. The item URL shape was confirmed against the live registry — the documented `add` command redirects to it:

```json
"registries": {
  "@reactflow": "https://ui.reactflow.dev/registry/{name}.json"
}
```

- [x] Both shadcn manifests declare the namespace — the one `app` owns and the one `ui` owns — so a component can be generated into either package without the generating step deciding which registry exists.
- [x] `pnpm dlx shadcn@latest view @reactflow/base-node` (or the CLI's current equivalent) resolves through the declared namespace, and the result is recorded in the ticket. A declaration that resolves nothing is worse than none: it makes the search step look done.
- [x] `docs/agents/ui.md` names the namespace where it states the shadcn-first order, so the search step has somewhere to point.
- [x] `pnpm verify` is green and reported.

Verification: `pnpm dlx shadcn@4.18.0 view @reactflow/base-node` resolved the
`base-node` registry item from the `@reactflow` namespace in the app workspace.
The command was read-only; it installed no component.

Repository verification: `pnpm verify` passed (159 test files, 1,830 tests
passed and 8 skipped).

## What this is not

Permission to install anything. Adding the namespace makes the registry *searchable*; a component taken from it is still an ADR 0047 decision and still owes ADR 0052's two proofs. Issue 05 is the first such decision and is deliberately separate.

## Why the namespace and not a bare URL

A bare URL in an `add` command is a one-off that leaves no trace for the next reader. The namespace is the durable half: it is what a search step can enumerate, and what makes "we looked and there was nothing" a checkable claim rather than an assertion.
