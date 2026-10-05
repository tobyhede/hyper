# Running serves an Aggregate directory as the durable copy

Status: accepted
Related: 0018, 0030, 0056, 0078, 0109

`pnpm start <dir>` **runs** an Aggregate directory. It Imports the directory into a fresh in-memory store, serves the application from that store, Exports back to the directory after every committed edit once edits have been quiet for about a second, Exports once more when the run is stopped, and discards the store. A directory that is missing or empty is established as the new Space (ADR 0018) and written at once; a directory holding only dot-entries, such as the `.git` a fresh `git init` leaves, is empty, and its dot-entries are kept. A directory that is not a valid Aggregate directory, including a single Space directory with no `hyper.json`, is refused with the intake's errors and nothing is served.

While Running, **the directory is the durable copy and the store is ephemeral**. Exporting is the only thing that makes an edit durable. This does not change ADR 0030 for the database hosts, where the database is the live write model and Exporting records a Space outside Hyper.

**Git is assumed, and it answers for history, undo and concurrent writers.** The directory is expected to be under version control. Hyper does not fingerprint the directory, lock it against a second run, detect changes made on disk during a run, or merge. The last write wins. A bad edit, a `git pull` during a run and two runs on one directory are all recovered with git.

The reason is that an author who keeps a talk or a design in a git repository wants the files to be the work, and `git status` to show what changed. The previous route was to Import into a database, edit, remember to run `hyper export`, and commit. Every step of that route that the author can forget is a way to lose work. Write-through removes the steps. Choosing git as the history, rather than building one into Hyper, keeps the run to one store and one write path, the existing atomic staged Export.

The run decides only when to Export:

- An Export follows each committed edit after a quiet period. Writes are serialised: an edit committed during a write causes exactly one further write after it, never a concurrent one.
- Stopping the run (SIGINT, SIGTERM or SIGHUP) Exports any edit not yet written and waits for that write. A second signal exits at once.
- A run that is started and stopped with no edit writes nothing, so it leaves the directory byte-for-byte unchanged.
- The clock behind the quiet period is injected at composition (ADR 0109), so tests advance it rather than wait.

**Cost accepted: an edit can be lost by a crash before its debounced write.** A process killed with SIGKILL, or a machine that loses power, within the quiet period loses the edits not yet written. Writing on every commit would close that window at the cost of a full staged Export for each keystroke-sized edit. For a single-user product whose directory is under version control, this cost is accepted.

**Rejected: detecting on-disk changes, or locking the directory.** Both answer concurrent writers, which git already answers. Detection needs a fingerprint of everything a run last wrote and a policy for a conflict, and a lock needs recovery when a run dies holding it. Each adds a second mechanism that disagrees with git about which version of the files is current.

**Rejected: running against SQLite or PostgreSQL.** Running is always the memory store. A database that outlives the run would be a second durable copy, and the two copies could disagree.
