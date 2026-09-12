# 02 — Name Aggregate directory and house the read + identify path

**What to build:** The glossary names the on-disk Aggregate directory, and
reading one (including identifying Spaces with an injected id mint) goes through
a new `src/aggregate-directory/` module. Callers that used to read via
`src/import/` for directory bytes now use that module. The reader hands the
persistence seam `AggregateInput` directly — no twin "source" type. File intake
failures use `AggregateDirectoryError`; identity failures stay
`SpaceIdentityError`.

**Blocked by:** None — can start immediately (parallel with 01).

**Status:** resolved

- [x] `CONTEXT.md` has an **Aggregate directory** entry beside Exporting /
      Importing
- [x] `src/aggregate-directory/` exists with the settled split (aggregate file,
      Space directory, identify, public index)
- [x] `readAggregate` / `readSingleSpace` / `identifySpace` /
      `describeSchemaFailure` live there; `readAggregate` returns
      `AggregateInput`
- [x] `SpaceImportFileError` is renamed `AggregateDirectoryError`;
      `SpaceIdentityError` remains distinct
- [x] Old `src/import/read-aggregate`, `read-single-space`, and `identify-space`
      modules are gone; import door routing stays under `src/import/`
- [x] Import CLI, fixtures, identify / decoding / read-aggregate tests, and
      Aggregate round-trip *read* coverage stay green

## Notes

The settled name `aggregate-root.ts` was rejected by the ADR 0088 vocabulary
guard (retired "aggregate root" sense). The file is `aggregate-file.ts`.
