# 01: Write the source comment rule

**What to build:** A written rule for what a source comment may carry, sitting beside the existing comment rules, so ticket 10 can apply it mechanically and review can hold it afterwards. A comment states what the code does, why, and the invariant it keeps. It does not narrate lineage — what the code replaced, what was retired, what it "used to" do, which alternative was rejected. An ADR or ticket citation is kept only where the constraint it names is not visible in the code itself.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The rule is written with at least one before/after example for lineage prose, and one for a citation that stays
- [ ] The rule says where lineage goes instead (commit message, ADR, ticket)
- [ ] Every vocabulary-test mask and exemption that depends on comment text is listed, with whether removing that text would break it
- [ ] `pnpm verify` green
