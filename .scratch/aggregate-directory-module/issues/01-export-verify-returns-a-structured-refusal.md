# 01 — Export verify returns a structured refusal

**What to build:** When a staged Aggregate directory fails to read back as a
valid Aggregate, export reports that as a structured outcome rather than
throwing a pre-rendered `Error`. The CLI turns that outcome into the same
operator-facing sentences it already uses for import refusals. Export no longer
depends on the CLI module for wording.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] `AggregateExportResult` includes an `invalid-staged-aggregate` arm carrying
      the intake errors, the Spaces that were re-read, and the Meta Space id
      export believed it wrote
- [x] The CLI renders that arm through `describeAggregateRefusal` (same path as
      import)
- [x] Export does not import from `cli/`
- [x] Existing export / round-trip tests stay green; add coverage that a verify
      failure surfaces as the new arm rather than an opaque thrown message
