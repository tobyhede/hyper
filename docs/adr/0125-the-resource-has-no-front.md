# The Resource has no front

Status: accepted
Refines: 0051
Related: 0064, 0070, 0122

A Resource on a Map is drawn **Closed**, as its Title, or **Open**, as its content, at the size its Map entry authors. "Front" is not a word for either, and it is not a word for anything else. The Resource is what is drawn; Closed and Open say how.

"Front" came from the card prototype, where a card had a face. Nothing in the domain has a back. Over time the word came to mean two things that already had names: a Resource as drawn on a Map, which is Closed or Open (ADR 0064) at a size independent of Open (ADR 0122), and, in code, the operations a kind offers beyond the shared Title (ADR 0051). The type that carries those operations is `KindOperations`, and `CanvasResource` takes it as `kindOperations`.

This refines ADR 0051 in its vocabulary only. A kind still owns everything beyond the Title, and Resources still keep one uniform geometry across kinds.

## Rejected

Keeping "front" as a loose word for how a Resource is drawn, and renaming only the code type. A word the model does not need is one an author or agent will reach for to mean something new; "front" would suggest a back and a flip, and the model has neither. A "Resource view" term was rejected for the same reason: Open already names it, and "view" is taken by the Space Resource, which draws its target's Map.

## Cost

About twenty accepted ADRs, ADR 0051 among them, keep "front" and "Card front" as history. They are not rewritten; this ADR and `CONTEXT.md` are where the current words are. `test/unit/current-domain-vocabulary.test.ts` holds the identifier shapes and the `Resource front`, `Closed front` and `Open front` phrases out of the source; the bare English word stays legal.
