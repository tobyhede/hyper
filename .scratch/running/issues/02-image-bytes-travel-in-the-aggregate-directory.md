# 02: Image bytes travel in the Aggregate directory

**What to build:** Exporting writes the bytes of every stored image the aggregate references into the Aggregate directory's `images/`, named by content, and Importing admits them before storing the aggregate — on every store. A picture uploaded in Hyper therefore survives Export, a reset and Import, and `pnpm hyper export` from SQLite or PostgreSQL carries pictures. Record the decision as ADR 0118, amending ADR 0106 (see `../spec.md`, Implementation Decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] ADR 0118 is written and ADR 0106's status block names the amendment; the `CONTEXT.md` Aggregate directory entry already lists `images/`
- [ ] Export writes `images/<content-id>.<ext>` for each referenced stored image, through the existing atomic staged write
- [ ] Export rewrites `images/` whole: an image no Resource references leaves the directory
- [ ] An external image URL, and a stored URL whose bytes are missing, export as URLs only and do not fail the Export
- [ ] Import admits every image in `images/` before the aggregate is stored, on memory, SQLite and PostgreSQL
- [ ] Import does not refuse a stored-image URL whose bytes are absent from `images/` (it draws as a missing image, as ADR 0106 already allows), so a directory exported with missing bytes still Imports; the fixture importer's own stricter refusal stays
- [ ] An aggregate with images round-trips byte-for-byte through Import then Export
- [ ] The fixture's separate image directory collapses into the fixture's own `images/`, and the fixture importer uses the normal Import path
- [ ] Tests extend the existing aggregate round-trip, export and import unit tests; the SQLite and PostgreSQL integration suites assert admission
- [ ] Targeted local checks pass; the draft PR's `CI passed` is green (including the `postgres` and `sqlite` jobs)
