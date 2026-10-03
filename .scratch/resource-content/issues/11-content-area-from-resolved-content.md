# 11: Whether an Open front draws a content area is answered from resolved content

**What to build:** `resource-content.ts` gains `drawsContentArea(content): boolean`. `CanvasResource` sets `data-content-area` from it, read off the display while Open and through the exit fade, and the rule at `canvas-resource.css:306` keys on that attribute rather than listing `data-kind` values no compiler sees. `useAreaContent`'s `space`/`ur` → `null` arms agree with it by construction, or ask it.

`PresentedResource` is out of scope: what a presented Space Resource draws is undecided (07), and this ticket does not decide it.

**Behaviour change (ADR 0114):** an Open Reference Resource to a Space Resource or an Ur Resource lays out its Title as its Target does, without the content-area ordering.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] A `CanvasResource` test proves an Open Reference Resource to an Ur Resource has no `data-content-area`, and one to a Markdown Resource has it.
- [ ] No stylesheet selects on a `data-kind` list to decide content-area layout.
- [ ] The Ladle story and application proof for the Resource front still hold (ADR 0052), and `pnpm ui:catalog:check` passes.
- [ ] CI passed on the draft PR.

## Comments

2026-10-03: CanvasResource publishes data-content-area from resolved content and retains it through the Close fade; CSS keys on that answer. A Reference-to-Ur/Markdown/fade regression failed before the change and passes afterward. PresentedResource behavior and rendering switches remain unchanged; image fixtures only gain the required naturalSize key.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.
