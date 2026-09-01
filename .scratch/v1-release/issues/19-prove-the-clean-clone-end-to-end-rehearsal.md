# 19 — Prove the clean-clone End-to-end rehearsal

Status: ready-for-agent
Tags: release/v1
Blocked by: 01, 02, 03, 08, 16, 17, 18, 20; `alias-cards/06`; `entity-url-addressability/08`; `space-cards/10`; `architecture-review/13`; `architecture-review/14`

**What to build:** Complete the untagged End-to-end checkpoint with one recorded
technical-author rehearsal from a clean clone and a compact proof matrix linking
every checkpoint claim to its executable or observed proof.

- [ ] Document the supported Node/pnpm, Docker PostgreSQL and desktop Chromium
      setup path for macOS or Linux without assuming an existing checkout state.
- [ ] Automated toolchain, migration, startup, unit, integration, Chromium and
      required Ladle evidence is green before the human rehearsal begins.
- [ ] The proof matrix maps every ticket 11 checkpoint claim to an executable test,
      fixture proof or recorded rehearsal step.
- [ ] The author completes install→Meta/Default Content→all Card kinds→multi-Space
      authoring→reload→presentation→aggregate export→hard reset→
      `--dangerous-truncate` import→reopen→recovered presentation.
- [ ] The observed aggregate preserves authored identities, content, selections,
      Layout state, Graphs and references.
- [ ] Setup-path and qualifying checkpoint defects discovered by the rehearsal
      are fixed here or assigned to an explicit blocking ticket before rerun.
- [ ] Cosmetic or low-friction defects are recorded; no known data-loss,
      incorrect-recovery, inaccessible-action, misleading-success or
      journey-blocking defect remains.
- [ ] The successful rehearsal is recorded as the End-to-end completion event;
      it creates no tag and does not claim `v1.0.0`.
