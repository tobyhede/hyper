# 02 — The kind registry, and Ur as its first module

Status: ready-for-agent

**What to build:** the module interface ADR 0120 and ADR 0128 describe, registered once at composition (ADR 0109's pattern), and the Ur kind moved onto it.

- **Domain half:** id, media types, `content` schema, Resource file codec, content resolution, declared outgoing references (typed Resource or Space), and flags: may be a Target, owns the lifetime of a Space it references, takes a Shape, can be Open. Registered wherever intake runs: the application, the HTTP host, the CLI and every repository.
- **View half:** how it draws Open and presented, its icon, its content actions (`KindOperations`, ADR 0125). Registered in the application only, so nothing outside it imports a view.
- `content` becomes unknown to the core and is parsed by the kind's schema. A kind nothing registers is refused at intake (ADR 0120).

Ur first because it has no content and no actions: it proves the seam with the least behaviour. Its Shape (ADR 0121) and never-Open (ADR 0122) rules become its flags; `docs/agents/maps-and-graphs.md` is the contract that states those rules and is updated in the same change to say they are read from the flags.

**Acceptance:** no code outside the Ur module names `'ur'`; Map rules for Shape and Open read the flags; the other four kinds still work through their existing branches.
