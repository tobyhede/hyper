# 02 — The kind registry, and Ur as its first module

Status: ready-for-agent

**What to build:** the module interface ADR 0120 and ADR 0128 describe, registered once at composition (ADR 0109's pattern), and the Ur kind moved onto it.

- **Domain half:** id, media types, `content` schema, Resource file codec, content resolution, declared outgoing references (typed Resource or Space), and flags: may be a Target, owns the lifetime of a Space it references, takes a Shape, can be Open. Registered wherever intake runs: the application, the HTTP host, the CLI and every repository.
- **View half:** how it draws Open and presented, its icon, its content actions (`KindOperations`, ADR 0125). Registered in the application only, so nothing outside it imports a view.
- `content` becomes unknown to the core and is parsed by the kind's schema. A kind nothing registers is refused at intake (ADR 0120).

Ur first because it has no content and no actions: it proves the seam with the least behaviour. Its Shape (ADR 0121) and never-Open (ADR 0122) rules become its flags. In the same change, `docs/agents/maps-and-graphs.md` rewords R39 and R46 to say those rules are read from the flags, and removes its "Accepted, not built" entry for them.

**Depends on:** 01.

**Acceptance:** no non-test source outside the Ur module names `'ur'`, except the missing-kind default `spec.md` names; the CSS selectors on `data-kind='ur'` and `data-content-kind='ur'` (`packages/ui/src/canvas-resource.css`, `packages/ui/src/stage.css`) are the module's view half (ADR 0120) and move with it; Map rules for Shape and Open read the flags; the exhaustive `case 'ur':` arms in the other kinds' switches (in `content-resolution.ts`, `projection.ts`, `dock-chrome.ts`, `CanvasResource.tsx` and `PresentedResource.tsx`, among others) go through the registry; the other four kinds still work through their existing branches.
