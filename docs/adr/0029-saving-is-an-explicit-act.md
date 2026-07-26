# Saving is an explicit act, and an edit never writes

Status: accepted
Refines: 0025
Related: 0018, 0021, 0028

An edit changes the space in the app and nothing on disk. The space is written when the author asks for it — `Cmd-S`/`Ctrl-S`, or a Save control in the toolbar — and at no other time. Between an edit and that ask the space is **unsaved**, and the Save control is what says so.

## This is 0025's mechanism, not a UI preference

ADR 0025 lets any edit convert an automatic arrangement into a Layout, and answers 0017's objection — that a stray drag would silently materialise a Layout — with one sentence: *you see the space is unsaved, you do not save, and nothing durable happened.* That sentence is only true if a drag does not write.

What shipped instead saved on every settled drag, so the second half of it was false. A stray drag materialised a Layout **in the authored space file**, repointed `defaultView` at it, and the space stopped opening in the arrangement it had. The only way back is `git checkout` on the space directory.

So explicit save is not layered over 0025; it is what 0025 already assumed. Conversion-on-edit is safe *because* declining to save is possible.

## What we gave up

**Auto-save on every settled edit**, which is what the code did. It is genuinely simpler — no saved state to track, no control to explain, no way to lose work — and it is what a local, file-first tool is expected to do. Its cost is that the file is written by gestures the author never meant as authorship. A click that React Flow reports as a two-pixel drag is an edit; so is a nudge while reading. Placement is authored content, the endpoint writes the authored space in place, and there is no shadow copy to absorb it — a drag dirtying the worktree is the deliberate consequence of that. Auto-save extends it until *reading* dirties the worktree.

**The prior art cuts against this, and it was read.** `.scratch/card-files/prior-art-working-copy.md` surveys file-first editors and finds the shipped designs split between writing the authored file on a debounce and holding the working copy in memory until a save. The two closest structural analogues — Obsidian's vault of markdown and Logseq's directory of it — both take the first, at roughly 2 s and 1 s, and neither keeps a working copy. What separates them from this app is what the file holds. A note's text is content the author typed and cannot reproduce, so writing it continuously protects something worth protecting. The file at risk here holds an **arrangement**, which the author can redo in a few drags — and the accident it invites, a Layout materialising from a stray drag, is caused by that same continuous writing. Same mechanism, opposite verdict, because the content is not the same content. When card bodies become editable the survey's answer starts applying to us, and that is the trigger to revisit this.

**Auto-save with an undo.** Undoing across the file boundary needs either a shadow copy — deleted with the move to a space directory, because shadowing a directory needs per-file merge rules and a tombstone per deletion — or a history the app maintains. Git is already the durable undo, and "do not press Save" is the ephemeral one. Neither needs building.

## The cost we accept

**Work can be lost.** Close the tab on an unsaved arrangement and it is gone, with no recovery, because nothing was written. A `beforeunload` guard turns that from a surprise into a question and is worth adding, but it does not make the loss impossible and is not what makes this decision safe. What makes it safe is that the thing at risk is small: an arrangement the author can redo in a few drags, never content they typed. That stops being true the moment card bodies are editable in the app, and this decision should be revisited then rather than stretched to cover it.

**Saved state is app state, not a comparison against disk.** The app counts its own edits and remembers which count reached the server; it never diffs the store against the file. So a reload reads as saved whether or not it matches what is on disk, and a save that another process overwrites afterwards still reads as saved. In exchange, "unsaved" costs one counter and cannot be wrong about what the author did in this session — which is the only thing the indicator claims.

**A save can fail silently.** The write goes to a dev-only endpoint that answers 501 when there is nowhere to write (ADR 0018), and a build has no endpoint at all. A failed save leaves the space unsaved, which is accurate and is all the author is told. Reporting *why* is a separate job.

## The suggestion this exists to refuse

A future review will find a prototype that can lose an arrangement on a tab close, and propose auto-save — or debounced auto-save, or save-on-blur, or save-on-navigate. All of them write without being asked, and each reintroduces the failure above. That proposal is this ADR. If the argument is that work should not be lost, the answer is the `beforeunload` guard and eventually a Draft that survives a reload, not a write the author did not ask for.
