# 03 — Create an Ur Resource from the Command Dock

Status: ready-for-agent
Blocked by: 01

**What to build:** a fourth peer glyph in `CreatePeers` that creates an Ur Resource in one press, completing its Edit on activation (ADR 0089) and continuing at the new Resource's Title. The Resources list (`ResourcesPopover`) gains `ur` in its kind filters. The Option/Alt empty drop and Connect to Resource's New Resource row keep minting Markdown.

**Acceptance:** Space Authoring has a create operation for `ur`; Dock tests and the `command-dock-creates-each-kind-in-one-press` parity claim cover the fourth kind; `packages/app/ladle-e2e/command-dock.spec.ts` and any `packages/app/e2e` / `test/e2e` proofs that count the glyphs are updated.
