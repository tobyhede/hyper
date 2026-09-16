# 08: A new structural literal fails the build

**What to build:** The contract step. Once no surface states its own geometry, adding one back fails a check rather than passing review unnoticed. Without this the tree drifts back to where it started, one reasonable-looking arbitrary value at a time, and the next person to try a token change finds it half works.

The check belongs in the family of source-scanning unit tests the repo already keeps for claims a rendering test cannot state — the ones holding command-surface ownership, the CodeMirror encapsulation split, the graph package surface and the retired domain vocabulary. It reads both source trees and reports a structural arbitrary value or bare literal outside a recorded carve-out.

A carve-out is a value that genuinely should not be on a scale, carrying its reason, as tickets 01, 05 and 06 each provide for. The list is small and it is the exception, not a parking space: it is a ceiling in the same sense as the narrowing-assertion suppressions, and it does not grow to accommodate new work.

**The check also holds two lists together.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name. An unregistered `*-chrome-*` utility therefore does not evict the built-in class it replaces, and two conflicting declarations ship. The build stays green and no test fails, so only a reader finds it.

That makes the registration list beside `cn()` a second list that must agree with the token list in the theme file. Tickets 03 to 07 each add to both. A reminder in those tickets is not enough, because the repository's own rule is that a claim needs something that fails when a person reverses it. So this check reads both lists and fails when a token has no registration, or a registration has no token.

**Land ticket 11 before this one.** A colour token wrapped as `text-[var(--foreground)]` matches the same `text-[…]` shape this scan reports, and there are fourteen of them. Ticket 11 removes them, which is cheaper than a carve-out that outlives its reason.

The scan must distinguish a structural **value** from a Tailwind **selector**: roughly a hundred and fifty `data-[…]`, `has-[…]` and `group-data-[…]` constructs in the tree are state selectors, not geometry, and reporting them would make the check useless on its first run.

**Blocked by:** 03, 04, 05, 06, 07.

**Status:** ready-for-agent

- [ ] A newly introduced structural arbitrary value or bare literal fails the check
- [ ] State selectors are not reported
- [ ] Carve-outs are enumerated, each carrying its reason, and the check fails if a carve-out no longer matches anything
- [ ] A `*-chrome-*` token with no `extendTailwindMerge` registration fails the check, and so does a registration with no token
- [ ] The check runs as part of the normal verification chain, so nothing else has to remember to run it
- [ ] `pnpm verify` passes and the output is reported
