# 04 — SQLite host and both restart proofs on the standalone host

**What to build:** `pnpm dev:sqlite` runs the SQLite target behind the standalone host, and `pnpm e2e:postgres` and `pnpm e2e:sqlite` prove durability by stopping and starting the host itself.

**Blocked by:** 02 — `pnpm dev` over PostgreSQL through a standalone host.

**Status:** ready-for-agent

- [ ] `dev:sqlite` keeps port 5177, migrates before serving, and takes its file only from the SQLite target's `SQLITE_PATH` rules.
- [ ] Stopping the SQLite host closes its database. The SQLite restart proof asserts that the first host's database is closed before the second host opens the file, instead of relying on no request being in flight, and the comment saying no close hook exists is gone.
- [ ] Both restart proofs still drive the application surface through the shared restart-proof helpers, and still run as the last step of their CI jobs.
- [ ] Ticket 15's Answer and checklist, and ticket 19's note on the missing close hook, carry a line pointing here.
