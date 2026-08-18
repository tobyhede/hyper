# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- **Two spellings of that line are in the tree and both are current**: bare `Status: resolved`, and `**Status:** resolved` in the ticket families that bold every field label (`**What to build:**`, `**Why:**`). Don't normalise them — the bold form is consistent *within* those files. Do write scans that tolerate both, because `grep '^Status:'` silently misses 37 files across seven whole efforts (`database-persistence`, `fetch-native-http`, `space-authoring`, `route-authoring`, `card-authoring`, `card-gestures`, `opening-is-editing`) and reports them as unstatused. Use `grep -iE '^\*{0,2}Status:\*{0,2}[[:space:]]+'` — the colon and the trailing space are required, or the scan also matches any line merely beginning with the word.
- A `Status:` line is not the whole picture: a **resolved** ticket can still carry deliberately-deferred work in its tail. Scanning statuses alone will not surface it — grep the bodies for `deferred`/`out of scope`/`follow-up` too.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

