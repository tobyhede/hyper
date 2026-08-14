# 02 — Adopt Lucide without changing icon meanings

**What to build:** Make Lucide the actual default icon vocabulary promised by ADR 0050, replacing incidental local drawings where Lucide carries the same meaning while retaining only icons whose Hyper-specific semantics genuinely have no honest Lucide equivalent.

**Blocked by:** 01 — Configure shadcn workspaces for Base UI and Lucide.

**Status:** ready-for-agent

- [ ] Classify every exported interface icon by meaning, not by visual resemblance, and replace each clear equivalent with its Lucide implementation.
- [ ] Keep a custom icon only when no Lucide glyph communicates the required Hyper-specific concept, and record that missing semantic distinction beside the exception.
- [ ] Preserve the existing public icon surface where changing it would add unrelated consumer churn; do not introduce a second general-purpose icon library.
- [ ] Keep decorative glyphs hidden from assistive technology and preserve every control's accessible name.
- [ ] Follow shadcn's icon composition rules for icons inside controls, including component-owned sizing and positional `data-icon` attributes where applicable.
- [ ] Verify the affected UI, app and React Flow adapter consumers with focused tests, typecheck and a production build.
