# 01 — A Resource with no kind is an Ur Resource

Status: needs-triage

**What to build:** ADR 0120's rule for a missing `kind`. `resourceFrontmatterSchema` stops defaulting `kind` to `markdown` (`packages/core/src/schema.ts`, `defaultMarkdownKind`). A Resource file with no `kind` and no body is an Ur Resource; one with no `kind` and a body is refused at intake, as an Ur Resource with a body already is.

**Roll forward in the same change (ADR 0054):** 23 tracked Resource files declare no `kind` — 17 under `packages/app/fixture/` and 6 under `packages/app/example/`. Each gets `kind: markdown` where a test reads, opens or presents its document, and otherwise becomes an Ur Resource with its body removed. Which is which is settled by searching the unit, E2E and Ladle tests for each file's Title and body text. The `hyper-authoring` skill says that a Resource with no `kind` is an Ur Resource and that a Markdown Resource declares `kind: markdown`.

**Acceptance:**
- A Resource file with no `kind` and an empty body loads as an Ur Resource.
- A Resource file with no `kind` and a non-empty body is refused at intake with a named refusal.
- Every tracked Resource file loads, and every test that read a fixture's document still finds it.
- Export of an Ur Resource round-trips through Import.
