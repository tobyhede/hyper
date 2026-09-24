# 12: Delete the approved meta-tests

**What to build:** Remove the meta-tests 11 marked for deletion, fold those marked for folding, and remove whatever supported them alone (fixtures, masks, exemptions, doc sentences that cite them).

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Every test marked delete in 11 is gone, and so is its support code where nothing else uses it
- [ ] Every test marked fold is merged, and the rows it asserted still hold
- [ ] Documents that cite a deleted test are updated
- [ ] `pnpm verify` green
