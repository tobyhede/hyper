# Working copy or write-in-place? — prior art for a file-first editor

Research note, 2026-07-24. **This informs a human decision; it does not pre-empt one.**
`.scratch/card-files/issues/03-write-card-files.md` already records a decision — write in
place, `space.local.json` dies, git is the undo. This note was commissioned to test that
decision against what shipped systems actually do, and it is written for a reader who has
*not* yet made up their mind. Where the prior art supports the recorded decision it says so;
where it cuts against it, §7 says that too.

Every non-obvious claim carries an inline URL. Sources are primary — official docs, spec
text, first-party release notes, and repository source read directly. Where a claim rests on
a vendor forum thread, a community plugin, or an inference from code rather than a stated
position, it is marked **[forum]**, **[secondary]** or **[inferred]**. §9 lists what could
not be verified.

The question: **do file-first local editors keep a separate working/shadow copy of the
user's documents, or do they write directly to the authored files and let version control
(or an undo stack) be the safety net? Where the answer is "write in place", what — if
anything — do they do about the resulting churn?**

---

## TL;DR

1. **The question as posed has a false middle.** Almost nothing ships option (b) — "copy the
   authored tree to a scratch directory and read/write only there". The shipped designs are
   either *(a)* write the authored file (in place, usually debounced), or *(a′)* hold the
   working copy **in memory** and touch the authored file only on save. Every on-disk scratch
   file in this survey — Emacs `#file#`, Jupyter `.ipynb_checkpoints`, VS Code's `Backups/`
   folder, Logseq `logseq/bak/` — is a **crash/undo artefact whose authored file remains
   authoritative**, which is the *inverse* of option (b).

2. **The two closest structural analogues both write in place.** Obsidian (vault of markdown;
   `.canvas` JSON holding node positions that reference note files by path) and Logseq
   (directory of markdown) both write the authored files directly, both debounce (~2 s /
   ~1 s), and neither keeps a working copy.

3. **The real dividing line in the prior art is not "copy vs no copy" — it is *where the copy
   lives*, and *what is allowed into the committed file*.** VS Code and Zed put crash state in
   the app data dir under an opaque hashed name and get no complaints. Jupyter put it adjacent
   to the notebook and it is in GitHub's default `Python.gitignore`, with a "please let me turn
   this off" issue open since 2022 ([jupyterlab#11826](https://github.com/jupyterlab/jupyterlab/issues/11826)).

4. **Emacs answers the version-control half of the question outright.** `vc-make-backup-files`
   defaults to `nil` — "*backup files are redundant when you store all the previous versions in
   a version control system*"
   ([Backup Files](https://www.gnu.org/software/emacs/manual/html_node/emacs/Backup.html)).

5. **The churn mitigations that shipped are: debounce, dedupe, format for diffs, and keep
   generated/ephemeral state out of the committed artefact.** Obsidian switched `.canvas` to
   multi-line JSON *"to make the diffs more human-readable when stored in version control"*
   ([v1.1.4](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v1.1.4.md)),
   and deliberately does **not** persist canvas viewport at all. The tools that actually solved
   notebook VCS noise did it by removing generated fields from the committed file
   ([Jupytext](https://github.com/jupytext/jupytext)) or filtering at the git boundary
   ([nbstripout](https://github.com/kynan/nbstripout)) — not by adding a working copy.

6. **Option (c) is close to unbuildable as *the* persistence mechanism here.** Firefox
   ("*harmful*") and WebKit ("*oppose*") have both formally rejected the local-file half of the
   File System Access API; `showDirectoryPicker` is Chromium-only. Chrome 122+ *does* offer
   persistent permission ("Allow on every visit"), so the re-prompt objection is weaker than it
   used to be — but **Playwright cannot drive the picker**, and neither can CDP: there is no
   permission type and no interception domain for it. The repo's verification bar is
   `pnpm verify` + `pnpm e2e`; option (c) would put the save round trip outside it.

7. **The honest split.** For a **single-user, version-controlled, file-first** app the prior art
   supports **(a)**, with one strong caveat the canvas apps supply: the thing that burns you is
   not writing the file, it is letting *ephemeral view state* into the file you write.

---

## 1. The three models, named

Reading across the survey, three distinct things get called "a working copy":

| Model | Where the live edits are | What the authored file is | Examples |
|---|---|---|---|
| **In-memory buffer + explicit save** | RAM (+ crash backup outside the workspace) | Untouched until you save | VS Code, Zed, Emacs buffers, tldraw's VS Code extension |
| **Write-in-place (usually debounced)** | The authored file itself | Continuously current | Obsidian, Logseq, Obsidian-Excalidraw plugin, Jupyter autosave, macOS "Autosave In Place" |
| **App-private store is the document** | localStorage / IndexedDB / SQLite | An *export/interchange* artefact, not the source of truth | Excalidraw web, tldraw.com |

Option (b) as the ticket frames it — *authoritative* edits in a gitignored scratch directory
while the authored tree goes stale — appears **nowhere** in this survey. The nearest shipped
things all keep the authored file authoritative and the copy disposable. The one genuine
exception is Jupyter's collaboration mode (§4.2), and even there the authored file is written
back after 1 s of inactivity and the shadow store is documented as safe to delete.

---

## 2. Obsidian — the closest analogue

### 2.1 Write behaviour: in place, ~2 s, no intermediate file

The 2-second autosave is confirmed by two official release notes:

- v0.10.2: *"Closing the vault or quitting the app within 2 seconds of editing a file will no
  longer lose the modifications done within that last 2 seconds."*
  ([obsidian-help Release notes](https://github.com/obsidianmd/obsidian-help/tree/master/Release%20notes))
- v0.11.6: *"When a change is made to a note on disk, but you also have changes in Obsidian
  that hasn't been auto-saved (within 2 seconds), the two versions will now be **merged
  automatically**. Previously the app would discard any unsaved changes."*

v0.11.6 is the load-bearing one: the only working copy is a **transient in-memory editor
buffer**, and the answer to an external change arriving mid-edit is to *merge*, not to keep a
shadow file. The plugin API exposes this at the read-modify-write level — `Vault.process` is
documented as *"Atomically read, modify, and save the contents of a note"*, and the docs say
*"Always prefer `Vault.process()` over `Vault.read()`/`Vault.modify()` to avoid unintentional
loss of data"* ([Vault docs](https://docs.obsidian.md/Plugins/Vault),
[obsidian.d.ts](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)).
`DataWriteOptions` lets a plugin pin `ctime`/`mtime` — an API-level admission that in-place
writing churns timestamps.

### 2.2 What lives outside the note files

| State | Where |
|---|---|
| Workspace layout, open tabs | `.obsidian/workspace.json`, `workspaces.json` |
| Vault prefs, hotkeys, plugins | `.obsidian/` |
| **Fold state** | `localStorage` — not in the file, not in `workspace.json` **[secondary: [Foldstate plugin README](https://github.com/samhopwell/obsidian-foldstate)]** |
| Metadata cache | IndexedDB |
| File Recovery snapshots | Global settings folder, **outside the vault** |

The gitignore advice is official: *"The `.obsidian/workspace.json` and
`.obsidian/workspaces.json` files store the current workspace layout and **update whenever you
open a new file**. If you use Git to manage your vault, you might want to add these files to
`.gitignore`"* ([How Obsidian stores data](https://obsidian.md/help/data-storage)).

**File Recovery** is Obsidian's answer to write-in-place risk: a core plugin taking *"complete
snapshots of your notes at regular intervals"*, ≥5 min apart, kept 7 days, *"kept in the Global
settings, **outside of the vault**"*, restoring only `.md` and `.canvas`
([File recovery](https://obsidian.md/help/plugins/file-recovery)). Note the placement — the
safety copy is deliberately not in the user's tree.

### 2.3 Churn: Obsidian *does* rewrite files you didn't edit

Renaming a note rewrites every file that links to it
([v0.4.0](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v0.4.0.md),
[v0.8.3](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v0.8.3.md)),
including links inside properties as of
[v1.11.0](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v1.11.0.md);
renaming a property *"will cause the property to be modified in each corresponding file"*
([v1.5.0](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v1.5.0.md)).

**Frontmatter normalisation is by design and officially defended.** Licat (Obsidian dev):
*"The decision we made is for plugins to be able to interact with frontmatter easily. We do
this by converting YAML into a JS object, which means it lose all of its YAML specific
formatting and comments."* WhiteNoise, same thread: *"As long as things are semantically the
same, it's not a bug and you should not expect for it to remain untouched."*
**[forum, staff]** ([thread](https://forum.obsidian.md/t/yaml-properties-api-processfrontmatter-removes-alters-string-quotes-comments-types-formatting/65851)).
The 1.4 changelog states *"Metadata is automatically formatted as valid YAML"*
([1.4.5](https://obsidian.md/changelog/2023-08-31-desktop-v1.4.5/)). Trigger is an **edit**;
no evidence of bulk rewriting of untouched files.

Directly relevant to ADR 0020: **an app that owns frontmatter will normalise it.** If `hyper`
parses `id`/`title`/`kind`/`target` out of YAML and writes the card file back, hand-authored
formatting and comments are on the line unless the writer is built to preserve them.

### 2.4 Canvas — near-identical to `space.json` + one file per card

[JSON Canvas 1.0](https://github.com/obsidianmd/jsoncanvas/blob/main/spec/1.0.md), read verbatim:

- Top level: `nodes`, `edges`. **Nothing else.**
- Node: `id`, `type` (`text|file|link|group`), `x`, `y`, `width`, `height`, optional `color`.
- **`file` node: `file` — "the path to the file within the system"**, plus optional `subpath`.
- Edge: `id`, `fromNode`, `toNode`, optional `fromSide`/`toSide` (`top|right|bottom|left`),
  `fromEnd`/`toEnd`, `color`, `label`.
- **Array order is z-index** — *"Nodes are placed in the array in ascending order by z-index"* —
  so array order is semantically meaningful, and a stable sort is not free.

Stated purpose: *"longevity, readability, interoperability, and extensibility to data created
with infinite canvas apps"* and *"ownership over their data"* ([jsoncanvas.org](https://jsoncanvas.org/)),
MIT, Obsidian-originated but implementable by anyone. It sits under the same "file over app"
thesis the project's founder wrote up — *"if you want to create digital artifacts that last,
they must be files you can control, in formats that are easy to retrieve and read"*
([stephango.com/file-over-app](https://stephango.com/file-over-app)).

Four findings from Canvas that bear directly on our design:

**(i) Viewport is not in the spec and is not persisted.** There is no viewport/zoom/pan key at
all, and Obsidian's behaviour is stated outright: *"Canvas: The canvas will always zoom to fit
on open"*
([v1.1.4](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v1.1.4.md)).
The only implementation that persists viewport is a third-party plugin that adds it as a file
extension ([obsidian-canvas-viewport](https://github.com/MattiaWasFound/obsidian-canvas-viewport)).
Card *positions* are written on move
([v1.1.11](https://github.com/obsidianmd/obsidian-help/blob/master/Release%20notes/v1.1.11.md)
fixed *"card position was not properly saved after moving a card via arrow keys"*). This is
exactly our Layout/viewport distinction, and Obsidian drew the line in the same place. It also
matches `.scratch/local-first/02`'s finding that centring is `fitView`'s job.

**(ii) They tuned the serialisation for git, and it wasn't enough.**
*"Canvas files are now multi-line formatted when saved. This should make the diffs more
human-readable when stored in version control."* (v1.1.4, Developers section). A user thread —
*"Even a simple action like typing a single character often causes the entire file structure to
change… changes in the position of cards result in a large number of differences, making it
nearly unreadable"* — got no staff reply **[forum]**
([thread](https://forum.obsidian.md/t/i-found-that-using-git-to-monitor-changes-in-canvas-files-is-basically-unreadable-are-there-any-other-methods/93262)).

**(iii) A positions blob is unmergeable, and they said so.** Obsidian Sync uses
diff-match-patch on markdown, but *"For all other files, **including canvases**, Obsidian uses
a 'last modified wins' approach"*
([Troubleshoot Obsidian Sync](https://obsidian.md/help/sync/troubleshoot)).

**(iv) The path reference is the fragile joint — and it is *weaker* than what ADR 0020 chose.**
`file` is an undefined "path to the file within the system"; the sample canvas uses vault-root
paths (`"file":"spec/1.0.md"`). Renaming inside Obsidian updates it — WhiteNoise: *"Ok so
rename has been implemented"* **[forum, staff]** — but renaming externally leaves an error
triangle and a manual per-card fix
([FR thread](https://forum.obsidian.md/t/canvas-store-file-cards-using-new-link-format-settings-so-files-can-be-moved-externally/52671)).
The spec's own issue tracker has *"are file nodes always local relative paths?"*
([#17](https://github.com/obsidianmd/jsoncanvas/issues/17)) and *"Define coordinate system"*
([#9](https://github.com/obsidianmd/jsoncanvas/issues/9)) **open and unanswered**, and
[#38](https://github.com/obsidianmd/jsoncanvas/issues/38) proposes a zipped `.canvasz` precisely
because *"the JSON Canvas file is going to end up mostly unusable due to non-existent or
unreachable file links"*.

ADR 0020's `id`-in-frontmatter — *"a card's identity comes from its frontmatter and never from
its path"* — is strictly stronger than JSON Canvas here. It is worth noticing that the shipped
spec regrets the thing ADR 0020 rejected.

---

## 3. Logseq — write in place, and the cautionary tale about UI state

### 3.1 Writes

Rewrites the **whole page file** on every change, rate-limited to one write per second per page:
`(def batch-write-interval 1000)`
([`outliner/file.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/modules/outliner/file.cljs#L17)),
plus a 500 ms editor auto-save timer
([`handler/editor.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/handler/editor.cljs#L1852)).
The Electron write is a bare `fs.writeFileSync` — **no temp-file-then-rename**
([`electron/handler.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/electron/electron/handler.cljs#L117)).
The DataScript DB is a cache serialised *outside* the graph; files win every conflict path.
Founder Tienson on why they rewrote: *"Creating a new block requires rewriting the entire
Markdown file. Renaming a page updates all files that reference it."*
([discuss.logseq.com](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744))

This is now historical: `master` is the DB version, SQLite is source of truth, and markdown
survives as an **opt-in one-way derived mirror** at `<graph>/mirror/markdown`
([db-version-changes.md](https://github.com/logseq/docs/blob/master/db-version-changes.md),
[`markdown_mirror.cljs`](https://github.com/logseq/logseq/blob/master/src/main/frontend/worker/markdown_mirror.cljs)).
A file-first project should read that as data: the highest-profile directory-of-markdown app
of the last five years concluded that files-as-source-of-truth cost more than it was worth *at
their scale and feature set*. It does not follow that it is wrong at ours.

### 3.2 `logseq/bak/` and `.recycle` — shipped shadow copies, but recovery-only

- **`logseq/bak/`** — latest **6** versions per page, written only when the diff contains a
  deletion, triggered by *disagreement* (external modification detected, write proceeding
  despite mismatch, write threw)
  ([`backup_file.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/electron/electron/backup_file.cljs)).
  Core dev cnrpman: *"Basically it writes to `bak` when there's a dangerous file operation… It's
  a safe net. And the dangerous operation usually caused by multi-device conflict."*
  ([#3370](https://github.com/logseq/logseq/issues/3370#issuecomment-1557267604))
- **`logseq/.recycle/`** — deleting a page *renames* the file in. **No cleanup code found** —
  appears unbounded **[inferred from source]**.
- **Logseq does not generate a `.gitignore`** — [#3189](https://github.com/logseq/logseq/issues/3189)
  was closed without one. The convention exists only in Logseq's own docs graph
  ([`logseq/docs/.gitignore`](https://github.com/logseq/docs/blob/master/.gitignore): `bak/`,
  `logseq/.recycle/`, …). **Both live inside the graph directory and had to be ignored by hand.**

### 3.3 `collapsed:: true` — the sharpest datapoint in this whole note

Logseq writes fold state **into the user's content file**, deliberately. The source comment:

```clojure
;; Don't check properties. Collapsed is an internal state log as property in file,
;; but not counted into properties
```
([`modules/file/core.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/modules/file/core.cljs#L20))

It is a documented hidden built-in property
([Built-in Properties](https://github.com/logseq/docs/blob/master/pages/Built-in%20Properties.md)).
**Consequence: clicking a disclosure triangle is a file write, a git diff, and a
sync-mergeable change.** Logseq's own docs graph carries **90 committed `collapsed:: true`
lines across 23 files**. The complaint thread
([discuss.logseq.com](https://discuss.logseq.com/t/please-add-possibility-to-avoid-having-collapsed-true-inside-the-page/6662),
April 2022) is **still open with no staff reply**, and no config suppresses it. The DB version
drops it **[inferred from master's schema/exporter, not a written statement]**.

Worse for our purposes: `id::` is injected into the *referenced* block's file — a file you
never opened — by both the serialiser and a repair pass that runs on every file loaded from
disk ([`fs/watcher_handler.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/fs/watcher_handler.cljs#L28)).
And every save renormalises the page: bullets re-emitted, indentation rewritten to the
configured unit (**default tab**), per-block `string/trim`.

**Obsidian and Logseq made opposite choices on the same question, and neither found a third
answer.** Obsidian put fold state in `localStorage` — invisible to git, unsyncable, and users
built a plugin to write `%% fold %%` markers back into markdown to get it back. Logseq put it
in the file — portable and syncable, and it is their most-complained-about interop wart.
A separate, versioned, in-repo structure file — which is exactly what `space.json` is — is the
third answer, and it is the position Obsidian independently arrived at for canvas geometry.

### 3.4 External change: refuse, don't clobber

Every write compares disk to the DB copy first; mismatch raises `:file/not-matched-from-disk`
and opens a **manual diff modal** — *"File `<path>` has been modified on the disk."* with two
editable textareas
([`fs/node.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/fs/node.cljs#L16),
[`components/diff.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/components/diff.cljs)).
Idle path: chokidar watcher → back up to `bak`, re-parse from disk, **disk wins**. Known bug if
you are editing when a reload lands — there is a `;; BUG:` comment in-tree
([`watcher_handler.cljs`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/fs/watcher_handler.cljs#L166),
[#11327](https://github.com/logseq/logseq/issues/11327)). **There is no locking**; two instances
on one synced directory is unsupported.

---

## 4. Jupyter — the scratch-copy approach that actually shipped, and how it went

### 4.1 What `.ipynb_checkpoints` is

From [`filecheckpoints.py`](https://github.com/jupyter-server/jupyter_server/blob/main/jupyter_server/services/contents/filecheckpoints.py):

- `checkpoint_dir = Unicode(".ipynb_checkpoints")` — *"a path relative to the file's own
  directory"*. Configurable; that is the only escape hatch.
- **Exactly one checkpoint per file.** `create_checkpoint` hardcodes
  `checkpoint_id = "checkpoint"`; the docstring says *"This contents manager currently only
  supports one checkpoint per file"*. Path: `<dir>/.ipynb_checkpoints/<base>-checkpoint<ext>`.
- `create_checkpoint` is a plain file copy of what is currently on disk; `restore_checkpoint`
  is the copy in reverse and **overwrites the live authored file** — no merge, no undo.
- Falls back to `tempfile.gettempdir()` if the parent isn't writable
  ([PR #1516](https://github.com/jupyter-server/jupyter_server/pull/1516), 2025).

**The server never creates one on its own** — it is a client-driven REST call
(`POST /api/contents/<path>/checkpoints`). The frontend creates one **on open** and on
**manual save** (`Ctrl/Cmd+S` does `await context.save(); … await context.createCheckpoint()`)
([`context.ts`](https://github.com/jupyterlab/jupyterlab/blob/main/packages/docregistry/src/context.ts),
[`docmanager-extension/src/index.tsx`](https://github.com/jupyterlab/jupyterlab/blob/main/packages/docmanager-extension/src/index.tsx)).
Because there is one slot, **every manual save clobbers the previous checkpoint**. It is a
one-deep undo of your last manual save, not a history.

**Autosave writes the real file.** `saveInterval || 120` seconds, calling the ordinary
`context.save()`, no checkpoint
([`savehandler.ts`](https://github.com/jupyterlab/jupyterlab/blob/main/packages/docmanager/src/savehandler.ts));
defaults `"autosave": true`, `"autosaveInterval": 120`
([schema](https://github.com/jupyterlab/jupyterlab/blob/main/packages/docmanager-extension/schema/plugin.json)).

The design rationale is stated, and it is the single most on-point document in this note:
[IPEP-15](https://github.com/ipython/ipython/wiki/IPEP-15:-Autosaving-the-IPython-Notebook)
**rejected** the desktop-style shadow-copy model because loading then needs logic like *"does
the notebook have an autosaved backup? yes, is the backup newer than the manual saved
version?"*, and adopted webapp-style autosave where **autosave is a real save**, with
checkpoints as a separate user-controlled restore point. Jupyter accepted VCS churn in exchange
for never having two sources of truth.

### 4.2 Is it considered a success? No — but note *which part* failed

- GitHub's own `Python.gitignore` ships `.ipynb_checkpoints`
  ([github/gitignore](https://github.com/github/gitignore/blob/main/Python.gitignore)).
- [jupyterlab#11826](https://github.com/jupyterlab/jupyterlab/issues/11826), *"provide a toggle
  to prevent the creation of `.ipynb_checkpoints`"* — **open since 2022**, opening rationale:
  *"if you manage your notebooks with a vcs they become a duplication of a functionality that is
  achieved in a different way"*. Collateral damage reported in-thread: Plotly Dash registering
  checkpoint copies as app pages, MLflow, Documenter.jl.
- [jupyterlab#4147](https://github.com/jupyterlab/jupyterlab/issues/4147) closed **not by a fix**
  but by pointing at `c.FileCheckpoints.checkpoint_dir`. [#4557](https://github.com/jupyterlab/jupyterlab/issues/4557)
  (checkpoints not cleaned up) open since 2018.
  [jupyter_server#1593](https://github.com/jupyter-server/jupyter_server/issues/1593) (2026) asks
  Jupyter to write a `.gitignore` into the folder it creates — unresolved.
- **No documented move away.** No `checkpoints_enabled` flag ever shipped; JupyterLab 4 and
  Notebook 7 did not change the model. The `NoOpCheckpoints` recipe was removed from the
  notebook docs at 7.0.0, and
  [jupyter_server#1348](https://github.com/jupyter-server/jupyter_server/issues/1348) reports it
  raising an unhandled error — open since 2023.

**The complaint is about *location*, not existence.** VS Code and Zed put the same kind of copy
in app state and attract none of this.

**Where Jupyter *did* adopt a real shadow store:** real-time collaboration replaced checkpoints
with an SQLite CRDT store, `.jupyter_ystore.db` — *"it is fine to just ignore it, including in
your version control system… If you happen to delete it, there shouldn't be any serious
consequence"* — and still writes the authored file after **1 s** of inactivity
([configuration docs](https://github.com/jupyterlab/jupyter-collaboration/blob/main/docs/source/configuration.md)).
Even the one true shadow store is disposable, VCS-ignored, relocatable — and does not stop the
in-place writing.

### 4.3 Notebook JSON churn — the direct precedent for a rewritten structure file

Three tools exist because a structured file rewritten wholesale on every save produces diffs
dominated by machine-generated fields, and they are three distinct strategies:

- **[nbstripout](https://github.com/kynan/nbstripout)** — filter at the VCS boundary: *"keep your
  output in the file on disk, but don't commit the output to Git"*.
- **[nbdime](https://nbdime.readthedocs.io/en/latest/)** — teach the diff tool the format;
  *"primitive line-based diff and merge tools do not handle well the logical structure of
  notebook documents"*, with auto-resolution of *"generated values such as execution counters"*.
- **[Jupytext](https://github.com/jupytext/jupytext)** — change the format: *"Only the notebook
  inputs (and optionally, the metadata) are included. Text notebooks are well suited for version
  control."*

None of the three is "add a working copy."

---

## 5. VS Code, Emacs, Zed, macOS — the in-memory family and where the copy goes

### 5.1 VS Code: buffer in RAM, backup outside the workspace

*"By default, VS Code requires an explicit action to save your changes to disk… **These changes
are not yet saved to disk, but VS Code automatically backs them up so they can be restored if
the application closes unexpectedly**"* ([Basic Editing](https://code.visualstudio.com/docs/editing/codebasics)).

Backups live in the user data dir, never the workspace — `%APPDATA%\Code\Backups`,
`$HOME/Library/Application Support/Code/Backups`, `$HOME/.config/Code/Backups` (docs), and in
source the full shape is
`<userDataPath>/Backups/<workspaceId-or-folderHash>/<uri-scheme>/<hashOfResourceUri>`
([`backupMainService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/backup/electron-main/backupMainService.ts),
[`workingCopyBackupService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/workingCopy/common/workingCopyBackupService.ts)).
Opaque hashed names, nothing in your project.

Cadence is the churn answer: backups are debounced 1000 ms (2000 ms when autosave is on, *"to
avoid too much load… when the user is typing"*) and **deduped by content version id**
([`workingCopyBackupTracker.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/workingCopy/common/workingCopyBackupTracker.ts)).

Defaults from [`files.contribution.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/files.contribution.ts):
`files.autoSave` = **`off` on desktop**, `afterDelay` on web; `files.autoSaveDelay` = 1000 ms;
`files.hotExit` = `onExit` on desktop, `onExitAndWindowClose` in the browser.

On external change with a dirty buffer, VS Code opens a **diff editor**: *"Use the actions in
the editor tool bar to either undo your changes or overwrite the content of the file with your
changes."*
([`textFileSaveErrorHandler.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/editors/textFileSaveErrorHandler.ts)).
JupyterLab does the same with a modal and a 500 ms `lastModifiedCheckMargin`.

### 5.2 Emacs: ships both models, and the relocation knob

*"Auto-saving does not normally save in the files that you visited… Instead, auto-saving is done
in a different file called the auto-save file… Normally, the auto-save file name is made by
appending '#' to the front and rear of the visited file name"*
([Auto Save Files](https://www.gnu.org/software/emacs/manual/html_node/emacs/Auto-Save-Files.html)).
Same directory by default; `auto-save-file-name-transforms` relocates. `auto-save-interval` =
300 characters, `auto-save-timeout` = 30 s idle. *"A buffer's auto-save file is deleted when you
save the buffer in its visited file"* — transient by design. `auto-save-visited-mode` gives you
the Jupyter model (autosave = real save, 5 s idle) as an **opt-in**.

Backups bound the churn structurally: *"**Emacs makes a backup for a file only the first time
the file is saved from the buffer that visits it.** No matter how many times you subsequently
save the file, its backup remains unchanged."*
([Backup Files](https://www.gnu.org/software/emacs/manual/html_node/emacs/Backup.html)).
One per *session*, not per save. `backup-directory-alist` relocates, flattening path separators
to `!` to avoid clashes. Numbered backups self-prune (`kept-old-versions`/`kept-new-versions`
both default 2).

And the decisive line for our question, from the same page:

> For files managed by a version control system, the variable `vc-make-backup-files` determines
> whether to make backup files. **By default it is `nil`, since backup files are redundant when
> you store all the previous versions in a version control system.**

Also worth carrying: the copy-vs-rename tradeoff
([Backup Copying](https://www.gnu.org/software/emacs/manual/html_node/emacs/Backup-Copying.html)).
Rename-based writing breaks hard links and changes file ownership; `backup-by-copying` defaults
`nil` but `backup-by-copying-when-mismatch` defaults `t`. If `hyper` writes via temp-then-rename
(§8), that is the tradeoff being made — and it is the right one for crash safety, since
`rename(2)` guarantees *"If newpath already exists, it will be atomically replaced, so that
there is no point at which another process attempting to access newpath will find it missing"*
([rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html)). Node's `fs.writeFile` gives
no such guarantee; npm's own [`write-file-atomic`](https://github.com/npm/write-file-atomic)
implements temp-write → `fsync` → rename, preserving mode and owner.

### 5.3 Zed: same model, different medium

Working copy in memory; `autosave` default `"off"`
([default.json](https://github.com/zed-industries/zed/blob/main/assets/settings/default.json)).
Unsaved buffer contents survive restart in **Zed's own SQLite DB, not the workspace** — an
`editors.contents TEXT` column plus `mtime_seconds`/`mtime_nanos`
([`persistence.rs`](https://github.com/zed-industries/zed/blob/main/crates/editor/src/persistence.rs)),
gated by `session.restore_unsaved_buffers` (default `true`), stored under
`~/Library/Application Support/Zed/db` / `$XDG_DATA_HOME/zed`
([`paths.rs`](https://github.com/zed-industries/zed/blob/main/crates/paths/src/paths.rs)).
No distinct model — reinforcement of VS Code's.

### 5.4 macOS: the platform vendor chose write-in-place

Apple's document architecture moved to **Autosave In Place** in OS X Lion:

> Autosaving in place differs from autosaving elsewhere in that it **overwrites the actual
> document file** rather than writing a new file next to it containing the autosaved document
> contents. (Autosaving in place performs a **safe save** by writing to a new file first, then
> moving it into the place of the document file when done.)

([Document-Based App Programming Guide](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/StandardBehaviors/StandardBehaviors.html))

Autosave-*elsewhere* survives only for **untitled** documents, in `~/Library/Autosave
Information`. The safety net is a system version store plus Revert. This is a large, deliberate
platform-level bet on exactly option (a): write the user's file, atomically, and put the undo
in a version store rather than a shadow copy. Our version store is git.

---

## 6. Canvas apps — where the file is not the source of truth

Three of four canvas apps surveyed do **not** write the authored file continuously; the one
that does has a release-notes trail of overwrite races.

**Excalidraw (web).** Scene + appState in `localStorage` (`"excalidraw"`, `"excalidraw-state"`),
images and library in IndexedDB via `idb-keyval`, saves debounced 300 ms
([`LocalData.ts`](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts)).
It **does** use the File System Access API via
[`browser-fs-access`](https://github.com/GoogleChromeLabs/browser-fs-access), and Cmd+S
genuinely overwrites a file on disk when a handle is live. But the handle is deliberately **not
persisted**: `fileHandle: { browser: false, … }` in `APP_STATE_STORAGE_CONF`
([`appState.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/appState.ts)),
so after a reload Cmd+S reverts to Save-as **[inferred from source, not empirically confirmed]**.
The predictable hazard fired: [#8841](https://github.com/excalidraw/excalidraw/issues/8841)
"Saving to the same file leads to data loss" — select-all-delete then Cmd+S writes an empty
scene over your file; maintainer: *"This is technically by design… But, thinking about it,
deleting all elements probably should clear the active file handle… losing data is worse."*
Also [#8395](https://github.com/excalidraw/excalidraw/issues/8395): exceeding the localStorage
quota silently stops saving, *"Some users report losing their entire board"*.

**tldraw.** Local state is IndexedDB, one DB per `persistenceKey`, throttled 350 ms; **without
a key nothing is persisted at all**
([persistence docs](https://tldraw.dev/docs/persistence),
[`useLocalStore.ts`](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/hooks/useLocalStore.ts)).
It does **not** use FSA for saving: `showSaveFilePicker` appears nowhere in the repo; `.tldr`
open uses `browser-fs-access`'s `fileOpen` and **discards the handle**, importing as a new
document; save is `<a download>` and the action is named `save-file-copy`. tldraw.com even
registers a `save-null` action *"that does nothing but blocks the command+s shortcut"*
([`useFileEditorOverrides.ts`](https://github.com/tldraw/tldraw/blob/main/apps/dotcom/client/src/tla/components/TlaEditor/useFileEditorOverrides.ts)).
The `.tldr` file carries its own schema and the newer app migrates it forward on load
([`file.ts`](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/utils/tldr/file.ts)) —
worth noting for a `space.json` with a `version` field.

**tldraw's VS Code extension** is the closest analogue to `hyper` in this group, and it is
model (a′): the webview posts serialized JSON on every *document-scope* change (debounced
250 ms), the host holds it in memory and only marks the document dirty; disk I/O happens
exclusively in `save()`/`saveAs()`
([`TldrawDocument.ts`](https://github.com/tldraw/tldraw/blob/main/apps/vscode/extension/src/TldrawDocument.ts)).
Crucially it filters ephemeral records out of the dirty check —
`multiplayerOmitKeys = /^(user_presence:|camera:|user:|user_document:|instance:)/` — so
**panning the camera does not dirty the file**
([`WebViewMessageHandler.ts`](https://github.com/tldraw/tldraw/blob/main/apps/vscode/extension/src/WebViewMessageHandler.ts)).
That is our Layout-vs-viewport distinction, implemented, in someone else's codebase.

**Obsidian Excalidraw plugin** — the one that *does* write in place, to `.excalidraw.md` in the
vault, on an autosave timer. What that forces, from its own source and release notes: a
`preventReload` semaphore because *"reload() is triggered indirectly when saving by the
modifyEventHandler"*; a shadow `.bak` written after each save; and a release-notes trail —
*"Fixed an issue where Obsidian sync would result in the loss of the last approximately 20
seconds of work"*; *"device 2 triggered an autosave sometimes overwriting the changes on the
first device"*; and *"Getting a lot of sync errors… for the `drawing.excalidraw.md.bak` file"*
— i.e. the mitigation became its own problem
([Release-notes.md](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/Release-notes.md)).

Note the confounder before importing this wholesale: **none of these are single-user
version-controlled apps.** Excalidraw and tldraw are multi-device/multiplayer web products
where the browser store *is* the document; the Obsidian plugin's failures are all
**Obsidian Sync** races. `hyper` is one user, one machine, one git worktree, one process.

---

## 7. A dev-server that writes your source files: a shipped precedent

`hyper`'s `PUT /__space` is unusual in the survey but not unprecedented. **Storybook** ships
"save from controls": you adjust a control in the browser and *"The story file's code will be
updated for you"* — a dev-server write-back into the user's authored source, with git as the
undo. It also ships the opt-out that prior art predicts you will be asked for:
`disableSaveFromUI` ([Controls docs](https://storybook.js.org/docs/essentials/controls)), added
in response to [#28377](https://github.com/storybookjs/storybook/issues/28377).

**Scrivener** is the closest packaging analogue: a `.scriv` **directory** with a structure file
(`project.scrivx`) plus one RTF per document — index-plus-content, exactly our shape. Users do
put it in git; the recurring advice is a gitignore separating authored content from the
volatile generated siblings (`binder.autosave`, `binder.backup`, `search.indexes`, `user.lock`)
**[forum, with L&L staff participating but not endorsing a list]**
([thread](https://forum.literatureandlatte.com/t/scrivener-and-source-control-git/36453)).
The lesson is the same one Obsidian and Logseq teach: the directory format survives git fine as
long as the churny files are *separable from* the authored ones.

---

## 8. The two technical questions

### 8.1 File System Access API — real state, July 2026

**Browser support.** `showDirectoryPicker` / `showOpenFilePicker` / `showSaveFilePicker` are
**Chromium-only**. MDN flags the API *"Limited availability… not Baseline because it does not
work in some of the most widely-used browsers"* and marks it **Experimental**
([MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)).
caniuse: Chrome/Edge 105+ full (86–104 partial), Opera 91+; **Firefox not supported, all
versions; Safari not supported, all versions through TP; no mobile support**; ~28.6% of users
([caniuse](https://caniuse.com/native-filesystem-api)). caniuse is an aggregator, but note that
**WebKit's own feature-status page has been retired and now directs readers to MDN and caniuse**
([webkit.org/status](https://webkit.org/status/)), which makes it the vendor-endorsed reference
rather than a secondary write-up.

Both non-Chromium vendors have **formally rejected** it, and both distinguish it from OPFS:

- **Mozilla: `position: negative`**
  ([standards-positions#154](https://github.com/mozilla/standards-positions/issues/154)).
  caniuse renders Mozilla's stance as *"harmful"*.
- **WebKit: `position: oppose`, `concerns: security`**
  ([standards-positions#28](https://github.com/WebKit/standards-positions/issues/28)). The issue
  is explicit: *"I'm not talking about the Origin Private File System part… that has already
  been implemented in WebKit, but about the part that allows for direct access to local files."*

**What they ship instead.** OPFS (`navigator.storage.getDirectory()`) is **Baseline widely
available since March 2023** — but OPFS files are sandboxed and **not visible in the user's real
filesystem** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory)),
so it is not a file-first story. For real files, the fallback is read-only:
`<input type="file" webkitdirectory>` yields `File` objects and `webkitRelativePath` — both
documented as **non-standard** — with no write-back
([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)); saving
falls back to `<a download>`, where the page **cannot choose the location**: *"How browsers
treat downloads varies by browser, user settings, and other factors"*
([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)).
`browser-fs-access`'s maintainer states the consequence plainly: *"The Native File System API
allows for true saving at arbitrary locations, whereas the legacy approach always downloads to
the Downloads folder. You also can't overwrite an existing file."*
([excalidraw#388](https://github.com/excalidraw/excalidraw/pull/388))

**Can a directory handle be re-acquired across sessions without re-prompting?** Partly — and
this is the part that has genuinely changed.

- Handles are serializable: *"Objects based on `FileSystemHandle` can also be serialized into an
  IndexedDB database instance"*
  ([MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)).
- The spec's default is that they come back needing permission: *"other than through the user
  revoking permission, a handle retrieved from IndexedDB is also likely to return `'prompt'`"*,
  and *"user agents are encouraged to… automatically expire permission grants except for
  particularly well trusted origins (for example persistent permissions could be limited to
  'installed' web applications)"* ([WICG spec](https://wicg.github.io/file-system-access/)).
- The historical Chrome behaviour: *"The web app can continue to save changes to the file
  without prompting until all tabs for its origin are closed. Once a tab is closed, the site
  loses all access."*
  ([Chrome capabilities docs](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access))
- **Chrome 122 shipped persistent permissions.** A three-way prompt: *"Allow this time"*,
  ***"Allow on every visit"*** (*"indefinite access unless access is revoked"*), *"Don't allow"*.
  You restore the handle from IndexedDB and call `requestPermission()`, which raises a prompt
  *"listing all `FileSystemHandle` objects the app previously had access to"*. Installed apps get
  persistence automatically; revocation is per-item in settings
  ([Chrome blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)).
- Read+write in one prompt has been available since Chrome 105 via
  `showDirectoryPicker({mode:'readwrite'})`; the previous double prompt was *"a poor user
  experience and contributes to confusion and permission fatigue"*
  ([Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/gvll5HyR5ps/m/3NNoZjuaBAAJ)).

So: **the re-prompt objection is now weak in Chrome and total everywhere else.**

**Two practical constraints worth knowing before designing a picker flow.** First, the picker is
blocklisted. The spec recommends restricting *"a user's entire 'home' directory… user agents
should not generally let users give blanket access to the entire directory"*, plus system dirs
and the downloads folder. Chromium implements this in `kBlockPaths` — `DIR_HOME`,
`DIR_USER_DESKTOP`, `DIR_USER_DOCUMENTS`, downloads, `DIR_USER_DATA`, and dot-directories
`~/.ssh`, `~/.gnupg`, `~/.config`, `~/.cache`, `~/.dbus` (`kBlockAllChildren`), with a
Windows-specific write block on `*/.git/hooks`
([chrome_file_system_access_permission_context.cc](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc)).
Children of Home/Desktop/Documents remain selectable **[inferred: the per-entry block type for
those four was not read directly; the spec's "individual files and directories inside the home
directory should still be allowed" is the basis]**. Second, handles go stale: *"The File System
object returned by `FileSystemFileHandle.getFile()` is only readable as long as the underlying
file on disk hasn't changed. If the file on disk is modified, the File object becomes unreadable
and you'll need to call `getFile()` again"* (Chrome docs). An external `git checkout` under a
live handle is exactly that case.

Standardisation status: still a **WICG incubation**, explicitly non-goal-ing *"subscribing to
file change notifications"* ([EXPLAINER](https://github.com/WICG/file-system-access/blob/main/EXPLAINER.md)) —
so a picker-based app cannot even be told the authored files changed underneath it.

### 8.2 Is `showDirectoryPicker` drivable by Playwright? No.

- **`FileChooser` does not cover it.** Playwright's `FileChooser` objects are *"dispatched by
  the page in the `page.on('filechooser')` event"* and `setFiles()` documents *"the file input
  this chooser is associated with"* — `<input type=file>`, nothing else. The File System Access
  API is not mentioned ([FileChooser docs](https://playwright.dev/docs/api/class-filechooser)).
- **No permission string exists.** `browserContext.grantPermissions` accepts
  `'accelerometer', 'ambient-light-sensor', 'background-sync', 'camera', 'clipboard-read',
  'clipboard-write', 'geolocation', 'gyroscope', 'local-fonts', 'local-network-access',
  'magnetometer', 'microphone', 'midi-sysex', 'midi', 'notifications', 'payment-handler',
  'storage-access', 'screen-wake-lock'` — **nothing file-system related**
  ([docs](https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions)).
- **CDP does not have it either**, so dropping to `newCDPSession` is not an escape hatch. The
  `Browser.PermissionType` enum has no file-system value
  ([CDP Browser domain](https://chromedevtools.github.io/devtools-protocol/tot/Browser/)), and
  there is no picker-interception command analogous to `Page.setInterceptFileChooserDialog`.
- **The feature requests are open and unanswered.**
  [playwright#11288](https://github.com/microsoft/playwright/issues/11288) (Jan 2022) proposes
  reusing `FileChooser` for the pickers — `P3-collecting-feedback`, no maintainer response.
  [playwright#18267](https://github.com/microsoft/playwright/issues/18267) (Oct 2022): *"Currently
  Playwright doesn't support accepting permissions… to view/edit a local file"* — same label, no
  maintainer response. [playwright#31162](https://github.com/microsoft/playwright/issues/31162):
  saving via `showSaveFilePicker` fires no `download` event, so you cannot even observe it —
  closed, `P3-collecting-feedback`. The same request in chromedp was **closed as not planned**
  ([chromedp#1364](https://github.com/chromedp/chromedp/issues/1364)).

**The only workable test strategy is to stub the API** — `page.addInitScript` replacing
`window.showDirectoryPicker` with an in-memory or OPFS-backed fake (third-party ponyfills exist:
[native-file-system-adapter](https://github.com/jimmywarting/native-file-system-adapter),
[use-strict/file-system-access](https://github.com/use-strict/file-system-access) — **both
secondary/community**). That tests *your* code around the handle. It does not test the picker,
the permission prompt, or that bytes reached the user's disk — which is the entire content of
"save the space and reload it".

**So ticket 03's claim — *"`showDirectoryPicker` cannot be driven by Playwright — so the save
round trip, the one thing this ticket exists to deliver, would become the one thing e2e cannot
test"* — is correct, and better supported than it was stated.** The one correction: the ticket
does not mention that Chrome 122+ solved the *re-prompt* problem, so "the user must re-pick the
directory every session" is no longer a valid additional argument against (c) on Chrome.

---

## 9. Failure modes we would inherit

**From write-in-place (a):**

1. **A structured positions file has an unreadable diff and no merge.** Obsidian pretty-printed
   `.canvas` for git and users still call the diffs *"nearly unreadable"* **[forum]**; Obsidian
   Sync gave up and uses *"last modified wins"* for canvases. If `space.json` holds all layouts
   in one object, every drag rewrites it. Mitigations with precedent: stable key order, one node
   per line, and — the structural one — splitting the file so a drag touches less.
2. **Write amplification.** Ticket 03 flags "bundle vs per-card"; the prior art is unanimous that
   a drag must not rewrite card bodies. Logseq rewrites the whole page file per change and its
   own docs graph carries the scars.
3. **Racing your own watcher.** The Obsidian Excalidraw plugin needed a `preventReload`
   semaphore, and a timer to reset the semaphore because *"there were odd cases when preventReload
   semaphore did not get cleared"*. `hyper` is currently immune only because nothing watches the
   space file — a property CLAUDE.md documents as deliberate. **Keep it, or inherit the semaphore.**
4. **Non-atomic writes.** Logseq uses a bare `fs.writeFileSync`; Apple's autosave-in-place makes
   a point of *"a safe save by writing to a new file first, then moving it into the place"*. The
   current plugin's `writeFileSync` is the Logseq pattern, not the Apple one.
5. **Normalising files the user hand-authored.** Obsidian defends YAML reformatting as
   not-a-bug; Logseq's every-save renormalisation converts space indentation to tabs. A `hyper`
   writer that round-trips frontmatter will do the same unless deliberately built not to.
6. **Ephemeral state leaking into content.** `collapsed:: true` is the canonical warning, and
   tldraw's `multiplayerOmitKeys` is the canonical fix. What counts as ephemeral for us —
   viewport, selection, hover, the currently-selected route — needs deciding before the writer
   lands, not after.
7. **Dirty worktree as an *interaction* cost.** No cited source measures this, but the visible
   consequence is that `git status` stops being a signal about your code while you are playing
   with a layout. Ticket 03 accepts this explicitly; it is the one cost in this list with no
   external evidence either way.

**From a scratch working directory (b):**

8. **Two-copy reconciliation is user-hostile, and IPEP-15 said so in 2013**: *"does the notebook
   have an autosaved backup? yes, is the backup newer than the manual saved version?"* — the
   reason Jupyter chose autosave-is-a-real-save. Our version is worse than Jupyter's, because
   ADR 0020 makes card *bodies* files a human edits in a text editor: a scratch copy goes stale
   against exactly the edits most likely to happen outside the app.
9. **Location is what people complain about**, and every complaint is about a copy *inside* the
   user's tree: `.ipynb_checkpoints` in GitHub's `Python.gitignore`, an open toggle request since
   2022, Logseq's `bak/`+`.recycle/` needing a hand-written gitignore, Scrivener's volatile files
   needing the same. VS Code and Zed put it in app data and nobody notices.
10. **Deletion and rename are unrepresentable without tombstones** — the ticket's own reason for
    killing per-file shadowing, and nothing in the survey solves it. Logseq's `.recycle` is a
    tombstone directory with no expiry.

**From export-to-picker (c):**

11. **Untestable at the repo's verification bar** (§8.2).
12. **Two-browser-engine dead end**: Firefox negative, WebKit oppose, no mobile.
13. **Stale handles on external change**, with no change notification in the API by design.
14. **Excalidraw's #8841** is the concrete write-in-place-via-handle hazard: an app-state bug
    (empty canvas) becomes destruction of the user's file, *"technically by design"*. Git would
    save us where it did not save them — which is an argument *for* (a)+git, not for (c).

---

## 10. Read on (a) / (b) / (c)

**For a single-user, version-controlled, file-first app, the prior art supports (a).** The
support is convergent rather than unanimous, and it comes from four independent directions:

- **The two closest structural analogues do it.** Obsidian and Logseq both write the authored
  markdown directly, debounced, with no working copy. Obsidian additionally puts card geometry
  in a separate structure file that references content files — our exact split — and keeps
  viewport out of it.
- **The platform vendor with the most at stake did it deliberately.** Apple moved the whole Mac
  document architecture to autosave-in-place, with safe-save and a version store as the net.
- **The one project that shipped the scratch-copy model rejected the two-copy alternative on
  stated grounds** (IPEP-15) and has spent a decade fielding complaints about the *location* of
  its remaining scratch file — not about writing the real file.
- **Emacs states the version-control case outright**: `vc-make-backup-files` defaults to `nil`
  because backups are redundant when git has the history.

**(b) has essentially no precedent** in the sense the ticket means it. Every on-disk scratch
copy surveyed keeps the authored file authoritative; none makes the scratch copy the place
edits live. Building it would mean inventing reconciliation rules that Jupyter explicitly
declined to invent, over content (card bodies) that is *more* likely to be edited externally
than a notebook is.

**(c) is a good additive command and a bad persistence mechanism.** Chrome 122 removed the
re-prompt objection, which is worth recording because the ticket's phrasing predates it — but
the Playwright/CDP gap is total, and two engines have formally refused the API. Excalidraw's
own experience (§6) is the fairest preview: FSA handles gave them true in-place saving *and*
[#8841](https://github.com/excalidraw/excalidraw/issues/8841).

**Where I would not manufacture consensus.** Three genuine splits:

1. **Obsidian vs Logseq on where UI state goes** is unresolved, and both answers are bad. Our
   `space.json` is a third answer neither reached for note-level state — which means we are on
   less-trodden ground than the rest of this note implies, even though Obsidian reached the same
   answer for canvas geometry.
2. **The canvas apps genuinely disagree with the editors.** Three of four keep the working copy
   out of the file; the fourth has a release-notes trail of overwrite races. If you weight
   "spatial editor" over "file-first editor" as the relevant category, the prior art points the
   other way. The counter is that all of them are multi-device or multiplayer, and none of them
   has git. **[This is a judgement call, not a finding.]**
3. **Whether a dirty worktree during authoring is acceptable** has no external evidence. It is a
   taste question about what `git status` is for, and the ticket answers it — reasonably — by
   saying a drag *is* an edit to authored content.

**If (a) is confirmed, the prior art is specific about what to build with it:**

- **Debounce and dedupe the write** (VS Code: 1–2 s + content-version dedupe; Obsidian: 2 s;
  Logseq: 1 s).
- **Write atomically** — temp file, `fsync`, `rename`
  ([rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html),
  [write-file-atomic](https://github.com/npm/write-file-atomic)) — not a bare `writeFileSync`.
  Note the inode change (Emacs's copy-vs-rename tradeoff) if anything ever watches the file.
- **Keep ephemeral state out of the written file** — viewport especially. Obsidian keeps it out
  of JSON Canvas and re-fits on open; tldraw's VS Code extension filters camera records out of
  the dirty check. `collapsed:: true` is the shape of the mistake.
- **Format the structure file for diffs** and keep key order stable (Obsidian's v1.1.4 change),
  and prefer a write granularity where a drag does not rewrite card bodies.
- **Do not add a file watcher** without first solving the reload-vs-edit race that the Obsidian
  Excalidraw plugin needed a semaphore and a semaphore-reset-timer for.
- **Bound any recovery artefact and put it outside the tree**, if one is ever added — Emacs's
  once-per-session, Jupyter's one-slot, VS Code's hashed app-data folder. Do not put it beside
  the authored files.

---

## 11. What I could and could not verify

**Verified from primary sources:** Obsidian's 2 s autosave and merge-on-external-change (v0.10.2,
v0.11.6 release notes); `Vault.process` atomicity language (obsidian.d.ts + docs); the
`.obsidian/workspace.json` gitignore advice and File Recovery's out-of-vault location (help
pages); JSON Canvas 1.0 schema in full including the absence of viewport and the z-index-is-array-
order rule; the v1.1.4 multi-line-for-git change and the "always zoom to fit on open" behaviour;
Obsidian Sync's "last modified wins" for canvases; Logseq's 1000 ms batch write interval, bare
`writeFileSync`, `bak/` 6-version cap, `.recycle` rename, `collapsed::` source comment and its
Built-in Properties documentation, and the disk-vs-DB diff modal — all read from tagged source;
Jupyter's `FileCheckpoints` semantics (one slot, copy-based, restore overwrites), the client-driven
checkpoint calls in JupyterLab, the 120 s autosave default, IPEP-15's stated rationale,
`.ipynb_checkpoints` in GitHub's `Python.gitignore`, and the open issue trail; jupyter-collaboration's
`.jupyter_ystore.db` guidance; VS Code's backup location (docs + source), 1000/2000 ms debounce with
version-id dedupe, and the autosave/hotExit defaults from `files.contribution.ts`; the Emacs manual
on auto-save naming/intervals/deletion, once-per-session backups, `vc-make-backup-files` defaulting
to `nil`, copy-vs-rename, and backup pruning; Zed's `restore_unsaved_buffers` and SQLite `contents`
column; Apple's autosave-in-place and safe-save wording; Excalidraw's storage split, 300 ms debounce,
non-persisted `fileHandle`, and issues #8395/#8841; tldraw's IndexedDB persistence, absent
`showSaveFilePicker`, `save-null` action, and the VS Code extension's `multiplayerOmitKeys`;
`browser-fs-access`'s FSA-or-fallback behaviour; the Mozilla and WebKit standards positions; the WICG
spec's permission-expiry and IndexedDB-rehydration language; Chrome 122 persistent permissions and
the Chrome 105 `mode:'readwrite'` intent-to-ship; Chromium's `kBlockPaths`; Playwright's
`FileChooser` scope, `grantPermissions` list, and the three open/closed issues; CDP's
`Browser.PermissionType` enum; `rename(2)` atomicity; `write-file-atomic`'s algorithm; Storybook's
`disableSaveFromUI`.

**Could not verify / flagged:**

- **Whether Obsidian writes `.md`/`.canvas` atomically** (temp + rename). No primary source either
  way. The only atomicity mention is Obsidian coping with *other* programs' atomic writes.
- **Whether Obsidian's 2 s autosave figure is still current.** The only official numbers are from
  v0.10.2/v0.11.6 (2021).
- **Whether `.canvas` is rewritten on pan/zoom.** Card *moves* clearly write; the git-noise thread
  reports position churn the reporter could not explain and no staff replied. Given viewport is not
  in the spec, pan/zoom should not write — but this is inference, not a statement.
- **Obsidian's fold-state-in-localStorage** claim is primary for the plugin that works around it,
  secondary for Obsidian's internals.
- **Logseq's `.recycle` being unbounded** — absence of cleanup code, not a documented statement.
  Likewise "the DB version drops `collapsed::`" is read from master's schema/exporter.
- **Excalidraw's Cmd+S disappearing after reload** is inferred from `actionSaveToActiveFile`'s
  predicate plus `APP_STATE_STORAGE_CONF`; not confirmed in a live browser.
- **The per-entry Chromium block type for `DIR_HOME`/Desktop/Documents** (`kDontBlockChildren` vs
  `kBlockAllChildren`) was not read directly; "children remain selectable" rests on the spec's
  guidance, not the source.
- **Emacs `version-control` semantics** come from the source docstring; that manual node would not
  load (gnu.org refused connections intermittently). The Backup, Backup-Copying, Backup-Deletion,
  Auto-Save-Files and Auto-Save-Control nodes did load.
- **Scrivener's gitignore list** is a user post in a vendor forum thread that staff participated in
  without endorsing the list. Treat as convention, not documentation.
- **No primary rationale exists** from Excalidraw or tldraw for *why* a browser store beats
  continuously writing the user's file. The nearest is `vjeux` closing
  [excalidraw#711](https://github.com/excalidraw/excalidraw/issues/711): *"Let's keep using
  localStorage for now and if it actually becomes an issue in practice we can reevaluate."* §6's
  reading of those projects is synthesis from behaviour and bug history, not a quoted position.
- **Repo source was read from unpinned `main`/`master`** for VS Code, tldraw, Excalidraw, Zed,
  JupyterLab and jupyter_server (Logseq was read at tag `0.10.15`). Line references will drift.
