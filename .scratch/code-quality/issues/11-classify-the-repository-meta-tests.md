# 11: Classify the repository meta-tests

**What to build:** A decision sheet covering every root unit test that inspects the repository rather than running product code — its documents, tracker, skills, CI config, source text or vocabulary. Each is classified as protecting a code boundary (keep) or policing document or tracker hygiene (candidate for deletion), with a one-line reason. A human decides each row.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Every repository-inspecting test is listed, with what it guards and the last change it actually caught (from git history), if any
- [ ] Each row has a recommendation: keep, delete, or fold into another test
- [ ] Each row has the human's decision recorded
