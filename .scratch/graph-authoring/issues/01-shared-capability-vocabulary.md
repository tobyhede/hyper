# 01 — Move the shared capability vocabulary into its own module

Status: ready-for-agent
Blocked by: None (can start immediately)

**What to build:** Create `packages/app/src/authoring-commands.ts` holding the context-neutral half of `map-authoring-commands.ts`: `Capability<Invocation>` (today `MapCapability`), `EditOutcome<Completed>` (today `MapEditOutcome`), `offered` and `renameDraftAnswer`. Rename every caller onto them — the Map module, command outcomes' reported channels, `App.tsx`, `space-resource-context-commands.ts` and the tests. Where `PERSISTENCE_UNSETTLED` should live once `coordinated-context-delete.ts` loses its Graph arm is this ticket's to settle if the move makes it natural. See `../spec.md`.

**Why:** Graph authoring is the second instance of the capability shape. Declaring it under Map names would force Graph code to either borrow mislabelled types or declare parallel ones that can drift; the rename lands first, alone, so it can be proved to change nothing.

- [ ] `authoring-commands.ts` exports `Capability`, `EditOutcome`, `offered` and `renameDraftAnswer`; `map-authoring-commands.ts` exports none of them.
- [ ] No behaviour changes: every existing test passes unmodified apart from import paths and type names.
- [ ] `authoring-commands.test.ts` holds `offered` and `renameDraftAnswer`, moved from `map-authoring-commands.test.ts`.
- [ ] The Map module's doc comment points at the shared module for the vocabulary and keeps the Map-specific rules.
- [ ] `pnpm verify` green.

## Comments
