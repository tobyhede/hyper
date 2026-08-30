# 13 — Extract inline title editing for named Space chrome

**What to build:** Extract the Card title editor's interaction into a reusable production UI capability that can also edit Layout and Graph names without carrying the Card's paper treatment into the Sidebar or canvas header.

**Blocked by:** none.

**Status:** resolved

- [x] `@project/ui` owns one inline-title interaction: click to edit, focus and select the current name, Enter or blur to complete, Escape to cancel and restore, and a field-local refusal that leaves the draft editable.
- [x] Preserve the Card title editor's existing keyboard, focus-return and event-boundary behaviour. The extraction is behaviour-preserving for Cards; existing Card application and Ladle evidence remains green and unchanged.
- [x] Presentation is supplied as variants or composition rather than duplicated behaviour. The Card keeps its paper treatment; a Sidebar row uses compact transparent chrome; the canvas header keeps its bare title typography and adds only an editing/focus treatment.
- [x] The interaction accepts completion and cancellation operations in product language. It does not know Card, Layout or Graph ids and does not perform authorship itself.
- [x] Stable stories exercise the production component's Card and chrome treatments, including refusal recovery, and parity claims point to corresponding application tests.

## Interaction contract

A title is one refusable line, so it follows the existing Card rule: Enter and blur complete, Escape cancels. This deliberately differs from Markdown body editing, which blur does not complete. Starting an edit selects the current title so replacement is immediate. A refused blank title keeps focus and the draft instead of silently restoring the stored name.

## Not in scope

Layout or Graph authorship, Graph colour editing, changing the Card title lifecycle, or introducing a general-purpose form framework. Issue 14 consumes this capability for Space chrome.

## Answer

`InlineTitleEditor` now owns the shared refusable one-line interaction in `@project/ui`, composing the existing shadcn Input, Field and FieldError primitives while leaving authorship and product identities with its callers. Canvas Card, Sidebar and header variants retain their distinct treatments. Unit, application E2E and Ladle evidence cover completion, cancellation, refusal and focus behaviour.
