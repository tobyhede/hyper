# Grill the alias model

Status: open
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
