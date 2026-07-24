# 03 — Persist card files

Status: done
Type: task
Blocked by: 02

**The acceptance could not be met as written, because nothing creates a card.**
The only save trigger in the app is the end of a drag (`App.tsx`), which writes
a space file and no card at all. "Create a card, reload, it is still there"
needs an affordance that does not exist — it belongs to whichever ticket adds
one (`new-space/02`). So this ticket split:

**Done now.** Write in place: `space.local.json` and its `.gitignore` entry are
gone, the endpoint writes the authored `space.json`, `SPACE_BASE_ONLY` became
`SPACE_READ_ONLY` (its read-pinning job was vacuous once there is only a base;
its write-suppressing job is now the only thing between an e2e drag and the
committed fixture — verified by running the suite and confirming `git status` on
`fixture/` is clean). `serializeCardFile` lands in `graph` as the inverse of
`parseCardFile`, held to it by a round-trip property, because `new-space` needs
it under every option. The plugin's write is now atomic. `persist.ts`'s stale
`apply: 'serve'` claim is fixed.

**Deferred.** The endpoint still takes a space file only. Growing it to a whole
space, and the create-reload round trip, land with the thing that first creates
or edits a card — with a consumer and an e2e, rather than as an untested
capability nobody calls.

The writer half, deliberately separated so 01 and 02 are verifiable on reads.

`PUT /__space` writes one fixed path today, and the narrowness is the security
property: the client never sends a path, because an endpoint that takes one is an
arbitrary-file-write primitive for any page the human has open. That property is
not negotiable here — whatever the endpoint becomes, **every path stays derived
server-side**.

To decide when the ticket is picked up, not now:

- Whether the endpoint takes a whole space (space file plus card files, server
  writes what changed) or grows a second path for a single card. Bundle is
  simpler to reason about; per-card is less write amplification on a drag, which
  changes no card body at all.
- What a card file is *named*, given the filename is conventionally the card but
  is not its identity (ADR 0020). Derived from the title is the obvious answer
  and needs a collision rule.
**Decided: the writer writes in place, and `space.local.json` dies.** A save
writes the authored space directory, and git is the undo — `git checkout
packages/app/fixture` throws an arrangement away, where deleting one file used
to. Dirtying the worktree is accepted deliberately: ADR 0013 says placement is
authored, so a drag *is* an edit to authored content, and a visible diff is the
honest rendering of that. A gitignored shadow that silently changes what you are
looking at is the worse trade.

The two alternatives, both rejected. **A scratch working directory** (copy the
authored space on first run, read and write only there) keeps `git status` clean
but reintroduces two copies that can drift — and now the drift covers card
*bodies*, the thing most likely to be edited in a text editor, where
`space.local.json` could only ever go stale on structure. **Export to a
user-chosen path** via the File System Access API removes the server endpoint
entirely, which is a real simplification, but `showDirectoryPicker` cannot be
driven by Playwright — so the save round trip, the one thing this ticket exists
to deliver, would become the one thing e2e cannot test. Export stays available
later as an additive command; it is not the persistence mechanism.

Consequences to carry out with the writer:

- `space.local.json` goes, along with its `.gitignore` entry and the read-prefers-
  local fallback in the plugin.
- **`SPACE_BASE_ONLY` narrows rather than disappears, and should be renamed.** Of
  its two jobs, pinning reads to the base becomes vacuous — there is only the
  base — but no-oping writes becomes *more* important, not less: without it every
  e2e drag would write into the committed fixture. The flag is now "do not write",
  and its name should say so.
- `persist.ts`'s doc comment claims the plugin behind `/__space` is `apply:
  'serve'`. It is not, and has not been since reading had to work in a build.
  Fix it here, on the function this ticket rewrites.

**What the prior-art survey changed** (`../prior-art-working-copy.md`). It
supports the decision — Obsidian and Logseq, the two closest analogues, both
write authored markdown in place with no working copy; Jupyter's IPEP-15
explicitly rejected the two-copy model because "is the backup newer than the
save?" is user-hostile; and a gitignored authoritative scratch tree turns out to
have essentially no precedent at all. But it caught one defect and left two
warnings:

- **The write was not atomic.** `writeFileSync` straight onto the target is the
  Logseq pattern; Apple's autosave-in-place makes a point of writing a new file
  and renaming it over. Harmless while the target was a throwaway local file,
  and a content-destroying bug the moment it became the authored one. Now
  temp-then-`rename`, same directory.
- **Ephemeral state must not leak into content.** Logseq writes `collapsed::
  true` into user files, so a disclosure triangle is a git diff; their own docs
  graph carries 90 committed instances. tldraw's fix is to filter camera records
  out of the dirty check. We are clean today — a save writes positions, which
  ADR 0013 makes authored, and `defaultView`, which is authored intent; no
  viewport, no selection, no selected route. Anything added to the save needs
  this question asked first.
- **Nothing may watch the space file.** Already true and already deliberate; the
  survey shows the Obsidian Excalidraw plugin needing a `preventReload`
  semaphore, plus a timer to reset the semaphore when it failed to clear. That
  is what the alternative costs.
- For the deferred card writer: a round-tripping frontmatter writer will
  normalise files a human hand-authored, the way Obsidian reformats YAML and
  Logseq rewrites indentation. Decide that deliberately rather than discovering
  it.

## Acceptance

- Create a card, reload, it is still there — the round trip the whole editing arc
  has been missing.
- The written files load back through `loadSpace` unchanged.
- No client-supplied path reaches the filesystem; assert it.
- `pnpm verify` and `pnpm e2e` green.

## Answer (the card writer)

The round trip works: mint a space, drag its card, reload, and it is still
there, where you left it. `pnpm e2e` is 24 green, the fixture untouched.

**`SPACE_DIR` may name a directory that does not exist yet.** That is what
unblocked this. A minted space had nowhere to live, and even saved it could not
have reopened — with no `SPACE_DIR` a reload mints a *fresh* space rather than
reopening the saved one. Pointing at a not-yet-existing directory says "a new
space, here": the app mints, the first save brings the directory into being, and
from then on it opens like any other. No new concept — `SPACE_DIR` still decides,
and "missing" simply means "new". `pnpm dev:new` uses a gitignored
`packages/app/.space`.

**The endpoint takes a whole space, and still never takes a path.** Cards go as
`{ id, text }`; the server derives every path from the id. A card already on disk
is rewritten where it sits, so a card an author put beside the space file stays
there rather than being duplicated into `cards/` — which would have been a
`duplicate-card-id` load error rather than a cosmetic problem. Ids are bounded to
a bare slug, because this is the one place a browser value reaches the
filesystem. Only files whose bytes differ are written, so a drag rewrites no card
body. A card missing from the payload is never deleted.

### Two bugs found by building it

**Vite cached the virtual module, so no save has ever been visible on reload.**
The seam has always claimed a save is "picked up on the next full page load",
and it was not: `load()` runs once, the result is cached, and a reload re-serves
the space as it was at server start. The file on disk changed and the app never
saw it. This is a **latent bug that predates this ticket** — it was invisible
because the persistence round trip had no e2e coverage until now, which is
exactly the gap noted when 03 was split. Fixed by invalidating the module after a
write; deliberately not an HMR push, so a save still cannot remount the graph
mid-drag.

**`import { z } from 'zod'` in the plugin stopped the dev server from starting.**
A bare specifier in a Vite *config* module is externalized and resolved by Node
from `packages/app`, where zod is not a dependency. `spaceFileSchema` is fine
because it arrives by relative import and esbuild bundles it — the documented
rule, one step further out than the note that records it. The payload check is
hand-written instead of adding a dependency to dodge it.

### Still open

Nothing in the app *creates a card* — the only card that exists is the one
`newSpace()` mints. The writer is proven by that card being persisted, which is
the honest available proof; a create-a-card affordance is a separate piece of
work, and when it lands it needs no new writer.
