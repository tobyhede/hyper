# Grill the alias model

Status: resolved
Type: grilling

## Context

Alias is a real modelling step, not a mechanical change like retiring Node was. The decisions in `spec.md` under "Open" all interact, and several are hard to reverse once authored content exists.

## Task

Walk the decision tree with the user (`/grilling`), covering at minimum:

- Does `Card` become a discriminated union now, and does it admit the `Space` kind from ADR 0001 at the same time or later?
- Where does alias resolution live — `core` (schema-level), `graph` (a resolution pass), or at render time?
- Are alias-of-alias chains legal? If so, are they flattened at intake or walked on read?
- What does `validateReferences` add: self-reference, unresolved alias target, alias cycles?
- Do edges and route steps target an alias card the same way as any other card? (Expected: yes — an alias *is* a card with an id.)
- Does an alias inherit its target's title, or carry its own?

Record outcomes as ADRs where a decision is load-bearing and surprising.

## Acceptance

- Shared understanding confirmed before any schema is written.
- `CONTEXT.md` updated if any term sharpens.

## Answer

Grilled 2026-07-21. Every question above settled; recorded in ADR 0009 (the
load-bearing part) and sharpened in `CONTEXT.md` (the `Alias` entry).

- **Discriminated union now, on an explicit `kind`, defaulted to `'markdown'`** so
  existing manifests parse unchanged. The `kind` field is chosen over structural
  inference because the glossary already makes "a card is one of three kinds" the
  primary fact about a card.
- **`space` deferred** to the change that actually builds recursive spaces (ADR
  0001). Its payload is an unsettled design question; a stub variant would parse
  but nothing would read it. The explicit discriminant makes adding it later a
  localized change.
- **Resolution is lazy, non-destructive, single-hop, in `graph`** — ADR 0009.
  Not flattened at intake (that would erase the alias identity routing and
  rendering need); chains rejected (single-hop makes cycles unrepresentable).
- **Validation gains three distinct error kinds** — `unresolved-alias-target`,
  `alias-self-reference`, `alias-targets-alias`. No cycle check: single-hop makes
  cycles impossible by construction.
- **Routes/edges target an alias exactly like any card** — a step names a card id,
  an alias is a real node with an id, content resolves only at draw time. This is
  what makes `C…C'` a forward redraw rather than a back-edge.
- **An alias carries its own required title; only content is inherited.** A
  differently-titled redraw is itself a "same content again" signal. Noted for a
  future authoring tool, not built now: default the title field to the target's
  title on create.
- **Deferred to issue 03:** the specific visual signal (badge/border/affordance),
  decided on screen.
