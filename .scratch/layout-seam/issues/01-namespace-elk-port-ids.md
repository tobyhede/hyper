# Namespace ELK port ids per card

Status: resolved

## Context

`buildElkGraph` (`packages/react-flow-adapter/src/elk/layout.ts`) uses the bare handle id as both the ELK port id and the edge endpoint:

```ts
sources: [edge.sourceHandle || edge.source],   // e.g. "main::out"
```

But `outHandleId(pathId)` is `` `${pathId}::out` `` — the same string on every card the route passes through. ELK receives edges whose endpoint exists on several cards at once and resolves arbitrarily, collapsing the layout.

This is a live defect, not a latent one. It degrades the shipped single-route view: the bundled demo's `paths` card collapses to layer 0 and the rail dives backward. `.scratch/multiple-routes/findings.md` Finding 1 has the measurements and screenshots.

## Task

Namespace the ELK port id with the card id (`${cardId}##${handleId}`) and build edge endpoints from the same key. The handle ids the render layer uses stay unchanged — only what ELK sees becomes unambiguous.

## Acceptance

- Single-route demo lays out left-to-right with zero back-edges.
- `pnpm verify` and `pnpm e2e` green.
- Worth landing independently of the rest of this feature — it corrects what ships today.

## Answer

Fixed. `buildElkGraph` now builds ELK port ids as `<nodeId>##<handleId>` (`elkPortId`) and derives edge endpoints from the same key; `getElkLayout` strips the prefix on read-back, so the render layer still looks ports up by bare handle id and `CardNode` is unchanged. An edge with no explicit handle still attaches to the node itself.

Measured on the bundled six-card demo, same ELK options, bare vs namespaced port ids:

```
BEFORE  intro=12 problem=292 model=572 rendering=852 paths=12 demo=432   <- collapsed
AFTER   intro=12 problem=432 model=852 rendering=1272 paths=1692 demo=2112
```

The "before" row reproduces `findings.md` Finding 1 exactly — the `paths` card collapses to layer 0 and `demo` jumps back left. After the fix the chain is strictly monotonic.

Regression tests added in `packages/react-flow-adapter/test/elk-layout.test.ts`: every card gets a distinct ELK port id, a single path lays out strictly left-to-right, and port offsets are still exposed under the bare handle id. `pnpm verify` 43 tests green, `pnpm e2e` 4 specs green.
