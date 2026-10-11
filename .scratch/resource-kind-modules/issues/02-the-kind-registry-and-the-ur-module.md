# 02 — The kind registry, and Ur as its first module

Status: resolved

**What to build:** the module interface ADR 0120 and ADR 0128 describe, registered once at composition (ADR 0109's pattern), and the Ur kind moved onto it.

- **Domain half:** id, media types, `content` schema, Resource file codec, content resolution, declared outgoing references (typed Resource or Space), and flags: may be a Target, owns the lifetime of a Space it references, takes a Shape, can be Open. Registered wherever intake runs: the application, the HTTP host, the CLI and every repository.
- **View half:** how it draws Open and presented, its icon, its content actions (`KindOperations`, ADR 0125). Registered in the application only, so nothing outside it imports a view.
- `content` becomes unknown to the core and is parsed by the kind's schema. A kind nothing registers is refused at intake (ADR 0120).

Ur first because it has no content and no actions: it proves the seam with the least behaviour. Its Shape (ADR 0121) and never-Open (ADR 0122) rules become its flags. In the same change, `docs/agents/maps-and-graphs.md` rewords R39 and R46 to say those rules are read from the flags, and removes its "Accepted, not built" entry for them.

**Depends on:** 01.

**Acceptance:** no non-test source outside the Ur module names `'ur'`, except the missing-kind default `spec.md` names; the CSS selectors on `data-kind='ur'` and `data-content-kind='ur'` (`packages/ui/src/canvas-resource.css`, `packages/ui/src/stage.css`) are the module's view half (ADR 0120) and move with it; Map rules for Shape and Open read the flags; the exhaustive `case 'ur':` arms in the other kinds' switches (in `content-resolution.ts`, `projection.ts`, `dock-chrome.ts`, `CanvasResource.tsx` and `PresentedResource.tsx`, among others) go through the registry; the other four kinds still work through their existing branches.

## Answer

Built. A kind module is a `kinds/` directory in each package it reaches, and the Ur kind is the first:

- **Domain half:** `packages/core/src/kinds/ur.ts` exports `urKind`, a `KindModule` (`packages/core/src/kinds/kind-module.ts`) with its id, its `content` schema, its flags (`takesResourceShape`, `canOpen`), its content facts and how its content resolves. `takesResourceShape` and `takesOpen` in `packages/core/src/schema.ts` read the flags through `kindFlags` (`packages/core/src/kinds/registry.ts`), so every Map rule for Shape and Open, at intake, in the Edit and on the canvas, reads them. Content resolution in `@project/graph` calls the module's `resolveContent`.
- **View half:** `packages/ui/src/kinds/ur.ts` holds the Ur kind's names and its `UrOperations`; its frame is `ur-canvas.css` and `ur-stage.css` beside it, moved out of `canvas-resource.css` and `stage.css`. The Shape choice is offered where `isUrOperations` holds, and the rail draws no kind mark on a kind that takes a Shape.
- **Everything else** names the kind through `urKind.id`, and `test/unit/kind-ids-in-modules.test.ts` fails any quoted `'ur'` in source outside a `kinds/` directory. The missing-kind default writes `urKind.id`, so it needs no exemption.

Two parts of the ticket are not built as written, deliberately:

- **The registry is static, not injected at composition.** Every built-in kind is compiled in (ADR 0120), and the Zod union and `takesOpen` are read at module scope by intake, the Edit and the canvas alike; injecting a registry would thread a parameter through `loadSpace` and every repository and change no behaviour. ADR 0120's runtime kinds would need it, and are not built.
- **`content` is still typed per kind, not `unknown`.** The four kinds not yet moved read their own fields through the closed union, which `03` to `06` replace one kind at a time. A kind's flags beyond Shape and Open (may be a Target, owns a referenced Space's lifetime) and its declared references are added by `05` and `06`, where the rules that read them move.
