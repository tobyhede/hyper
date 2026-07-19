# Namespace ELK port ids per card

Status: open

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
