# Resource content as a value

## Why

What a Resource draws as its content is inferred from which optional fields happen to be present on its canvas node, and a missing field becomes an empty Markdown document. So "not carried", "unresolved" and "genuinely empty" are indistinguishable; a closing Resource's content blanks mid-fade because the body is dropped the moment `open` flips; a Reference Resource to an Image Resource would fade through an empty body; presenting a Space Resource draws an empty document; and every new content kind adds another optional field and another inference in each layer.

## Design

Two values replace the inference. Four alternatives were explored (minimal interface, kind registry, most common caller, lifecycle); this is a hybrid of the minimal interface's content value and the lifecycle's display state. The type shapes below come from the design sketch and encode the decision.

**Content** — declared once in `core` (so `ui`, which depends only on `core`, sees the same type the resolution returns), resolved totally and single-hop in `graph` (ADR 0009):

```ts
type ContentVia = 'self' | 'reference';
interface SpaceView { spaceId; map; graph; framing }   // what an Open Space Resource shows, not the Resource
type ResourceContent =
  | { kind: 'markdown'; source: string; via: ContentVia }
  | { kind: 'image'; url: string; via: ContentVia }
  | { kind: 'space'; view: SpaceView; via: ContentVia }
  | { kind: 'unresolved'; via: 'reference' };
resolveResourceContent(space, resource: Resource): ResourceContent   // takes the Resource: total, never throws
```

`''` is a genuinely empty body. `unresolved` answers only states intake already refuses (a missing Target, a Reference Resource to a Reference Resource). `via` is the whole of "read-only by reference" (ADR 0070).

**Display** — in `ui`, what a node shows now:

```ts
type ResourceDisplay =
  | { shown: 'closed' }                                   // carries no content (ADR 0006, as narrowed by 0064)
  | { shown: 'open'; content: ResourceContent }
  | { shown: 'presented'; content: ResourceContent }
  | { shown: 'editing'; content: own markdown; editor; autoFocus: boolean }
  | { shown: 'replacing'; content: own image; replacer };
```

The projection emits `closed`, `open` or `presented`, deciding presenting-over-Open once. `editing` and `replacing` are produced only by pure helpers the decoration step applies, which do nothing unless the display is `open` with `via: 'self'` content of the matching kind — so no Reference Resource can be given an editor or Replace. Read-only is decided once, at the top of the Resource front.

**Fade** — the presence hook becomes generic over the value it draws and keeps the last one while leaving; an editor or replacer is never drawn while leaving. The UI owns time because only it knows the exit duration. With this, nothing is carried on a Closed node for the fade's sake, including the Image Resource's URL.

**No registry, no ports.** Exhaustive switches over the one union give the compiler checklist a new kind needs. Everything is in-process.

**No ADR.** This is a design choice inside ADRs 0006, 0009, 0064 and 0070: resolution stays in `graph`, Closed carries no content, Reference content stays read-only.

## Tickets

01 fade retains content → 02 content value (expand) → 03 Open and presented draw from it → 04 editing and replacing arms, 05 embedded Maps → 06 retire the inferred fields (contract). 07 is a triage question left open by 03.

`image-resource/06` (a Reference Resource targets an Image Resource) is reworked on top of 06 and reduces to its first-Open size rule plus its tests and proofs.
