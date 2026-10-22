# A mounted talk is editable in memory

Status: accepted
Refines: 0130
Related: 0064, 0106, 0117, 0118

A mounted talk behaves as any other session does. Every Edit is offered and accepted exactly as in a Running session, and it is committed to the memory store the page already holds (ADR 0130). Those Edits live as long as the page does: a reload mounts the talk again as it was committed to GitHub, and nothing the reader changed survives it. No browser storage keeps them, and nothing is written back to GitHub.

## The decision

- **A mounted session authors as any session does.** Authoring availability has no mounted answer. Every answer a mounted Space gives is the one the same Space gives anywhere else, so a control drawn in a Running session is drawn in a mounted one, and a gesture that completes an Edit there completes one here.
- **The in-page HTTP application accepts writes.** A Space commit and an image upload reach the Space host in the page and its memory repository, as they reach a host on a server. The same intake and commit decision answer them, so a mounted Edit is refused on exactly the grounds a Running one is.
- **An image uploaded in the page is drawn from its bytes.** The display resolver ADR 0130 supplies learns of every image the in-page store holds, those an Edit stores as well as those the directory carried, and draws each from an object URL over its bytes. ADR 0118's naming is unchanged.
- **Edits are lost on reload, and the Dock says so.** The mark ADR 0130 drew for a read-only session becomes a mark saying Edits are lost on reload. It is still a mark rather than a persistence status: a mounted session reports persistence as any session does, because its commits are real commits to the page's store.
- **Nothing writes to GitHub.** A mounted page holds no token and reads only public repositories (ADR 0130). Saving an Edit somewhere durable stays the author's own: `pnpm hyper run` over their checkout (ADR 0117).

This replaces ADR 0130's "No Edit is offered or accepted", its read-only availability answer, the in-page application's refusal of every write, and its read-only mark. Everything else in ADR 0130 stands: the GitHub source, the address and its pinned `source`, scoped presentation communication, the static build and the in-page seam.

## Why

- **One behaviour wherever a talk is open.** A read-only session is a second set of rules: a second availability answer to keep in step with every new Edit, a second persistence display, and a Dock that differs from the one the author learned. Every exception ADR 0130 drew between a mounted and a Running session was a place for the two to drift.
- **The store was already there.** The page answers its own API from a memory repository, and the first working load of a mapless Space already committed to it (`maps-and-graphs.md` R16). Letting the rest of the writes through uses the seam ADR 0130 built rather than adding one.
- **A talk is something to try things on.** A reader at a talk, or the author on a borrowed machine, can rearrange, open and annotate as they follow along, and loses nothing the talk depends on, because the committed talk is what every reload and every shared link opens.

## Rejected

- **Keeping Edits in browser storage, keyed by repository, directory and commit.** A reload, a shared link and the Notes window would then open the talk as one reader had changed it rather than as committed, and a stale entry would outlive the commit it was made against only to be orphaned by the next deploy. A talk should open as it is committed.
- **Writing Edits back to GitHub.** It needs a token, and a page that holds one is a page that can change the talk for everyone; ADR 0130 rejected a token for the same reason.
- **Keeping the session read-only** (ADR 0130). It held a second availability answer and a second persistence display for a session whose only real difference is that its store does not outlive the page.

## Cost accepted

- **An Edit made in a mounted talk is lost on reload,** including an accidental one, and including one the reader meant to keep. The Dock's mark is the only warning.
- **ADR 0130 rejected "ephemeral Edits in the tab"** because they look like work that is then lost. That cost is now accepted, against the mark that names it.
- **A mounted session's memory grows with what it stores,** an uploaded image's bytes included, for as long as the page is open.
