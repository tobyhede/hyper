# 01 — Move the shared capability vocabulary into its own module

Status: resolved
Blocked by: None (can start immediately)

**What to build:** Create `packages/app/src/authoring-commands.ts` holding the context-neutral half of `map-authoring-commands.ts`: `Capability<Invocation>` (today `MapCapability`), `EditOutcome<Completed>` (today `MapEditOutcome`), `offered` and `renameDraftAnswer`. Rename every caller onto them — the Map module, command outcomes' reported channels, `App.tsx`, `space-resource-context-commands.ts` and the tests. Where `PERSISTENCE_UNSETTLED` should live once `coordinated-context-delete.ts` loses its Graph arm is this ticket's to settle if the move makes it natural. See `../spec.md`.

**Why:** Graph authoring is the second instance of the capability shape. Declaring it under Map names would force Graph code to either borrow mislabelled types or declare parallel ones that can drift; the rename lands first, alone, so it can be proved to change nothing.

- [x] `authoring-commands.ts` exports `Capability`, `EditOutcome`, `offered` and `renameDraftAnswer`; `map-authoring-commands.ts` exports none of them.
- [x] No behaviour changes: every existing test passes unmodified apart from import paths and type names.
- [x] `authoring-commands.test.ts` holds `offered` and `renameDraftAnswer`, moved from `map-authoring-commands.test.ts`.
- [x] The Map module's doc comment points at the shared module for the vocabulary and keeps the Map-specific rules.
- [x] `pnpm verify` green.

## Comments

**2026-09-26, resolved.** `pnpm verify` green: every static step, then `test:coverage` with 255 files, 3459 passed and 19 skipped. `pnpm e2e` and `pnpm e2e:ladle` not run: the change renames types and moves two functions and a constant, with no surface or story touched; CI runs both.

- **The move.** `packages/app/src/authoring-commands.ts` exports `Capability`, `EditOutcome`, `offered` and `renameDraftAnswer`, and `map-authoring-commands.ts` exports none of them. Callers renamed: `command-outcomes.ts` (the reported channels' result types), `dock-chrome.ts` (App's Dock chrome now lives there, not in `App.tsx`), `space-resource-context-commands.ts` and the tests.
- **`PERSISTENCE_UNSETTLED` moved into `authoring-commands.ts`.** The Map module, the rail and both `coordinated-context-*` modules import it from there, so the Graph module can spend it without reaching into `coordinated-context-delete.ts`, and that module can lose its Graph arm (or go entirely) without taking the sentence with it. The tests still pin the sentence by literal.
- **The ESLint zone covers both modules.** `authoring-commands.ts` joins `map-authoring-commands.ts` in the no-continuation, no-React, no-DOM zone; its message and constants are renamed from `MAP_AUTHORING_*` to `AUTHORING_COMMANDS_*`. `graph-authoring-commands.ts` should be added to the same `files` list in ticket 02.
- **Tests.** `authoring-commands.test.ts` holds `offered` (moved) and a direct `renameDraftAnswer` case per arm (new: before, it was proved only through the Map rename contract, which still spends it and is unchanged apart from its import).

