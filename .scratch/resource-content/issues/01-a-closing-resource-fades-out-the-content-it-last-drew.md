# 01: A closing Resource fades out the content it last drew

**What to build:** When an Open Resource Closes, its content stays drawn through the exit fade instead of blanking. The presence hook that keeps the content area mounted while leaving becomes generic over the value it draws and keeps the last value it drew until it unmounts; re-opening mid-fade takes the new value. An editor or image replacer is never drawn while leaving. This alone fixes the Markdown Resource's mid-fade blank, before any content model changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Closing an Open Markdown Resource keeps its text drawn for the whole fade; the application proof of Close records the leaving content and asserts it is not empty.
- [ ] Re-opening a Resource while it is leaving draws the new content, not the retained one.
- [ ] A Resource closed while its body is being edited fades out rendered Markdown, not the editor.
- [ ] The hook's contract is tested directly: nothing mounted for an initial absent value; leaving holds the last value; unmounts after the exit duration.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.
