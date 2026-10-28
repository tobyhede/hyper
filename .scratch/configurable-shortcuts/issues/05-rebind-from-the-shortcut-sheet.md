# 05: Rebind a command from the `?` sheet

Status: needs-triage

ADR 0138. Depends on 03. Start with the `shadcn-first-ui` skill: this is a production UI surface.

**What to build.** The `?` sheet becomes the place keys are changed. Each remappable row gets a Change control that captures the next press. While it waits, the press it captures stops there: capture stops propagation and suspends the dispatcher (01), so `P` pressed to capture never presents. Escape cancels the capture and leaves the sheet open; a second Escape closes the sheet. The captured press is recorded as `plain`, or as `shift` when Shift is held; until triage decides chords, a press with Ctrl, Alt or Meta is refused on the row. A press that `checkOverride` refuses shows the reason on the row ("Already Add a Resource on the canvas") and changes nothing. Each row also gets Turn off, and Reset when the row differs from its default. The sheet has Reset all. A row that is not remappable says so instead of offering Change.

**Questions for triage.**
- Whether capture accepts modifier chords, such as `Ctrl+Shift+P`. Note that `pressesBinding` only knows `plain`, `shift` and `any` today.
- Whether the presenting keys are remappable from the sheet drawn while presenting, or only from the authoring sheet.

**Done when.** A Ladle story and its spec (`packages/app/ladle-e2e/`) cover capture, a refused collision, Turn off, Reset and Reset all. An e2e test remaps `P` to `Shift+P` and presents from a selected Resource with it.
