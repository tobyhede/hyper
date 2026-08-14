# 07 — Dialog migration report

The Card pane now composes `@project/ui`'s Base UI Dialog facade: Root, Portal,
Viewport, Backdrop and Popup. Base UI owns modal containment, Escape dismissal,
outside-pointer refusal and accessible dialog semantics; the app only supplies
the product's declared initial destination and post-close focus restoration.

ADR 0048 is preserved: an opened content Card keeps every field local until
Done, and Cancel/Escape discard the complete pending form. Alias creation is the
intentional exception: choosing Target creates it because that pane has no Done.

ADR 0049 is reconciled with current Edge-authoring mainline: opening an Alias
authors only that Alias's Title and Target in one `edited-card` completion. It
does not resolve or edit Target content. `CardPicker` remains the existing cmdk
model; its retired field-level Escape handler no longer competes with Dialog.

Focused tests cover pending/Done, Escape cancellation, Alias one-subject
completion, refusal retention, accessible naming and focus. The reconciled
Alias browser scenario and the focused card-pane scenario pass serially. Both
typecheck passes, `pnpm build`, and the full `pnpm test` suite pass. No
development server was started.
