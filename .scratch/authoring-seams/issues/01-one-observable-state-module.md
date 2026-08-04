# One observable-state module; three publishers disagree

Status: ready-for-agent

## Context

Three modules implement the same publish-to-listeners behaviour at three
hardening levels. Verified at `62023a4`:

| publisher | copies listener set | contains a throw | handles async rejection |
|---|---|---|---|
| `packages/app/src/navigation.ts` (`setState`) | no | no | no |
| `packages/persistence/src/session.ts` (`publish`) | no | yes | yes |
| `packages/app/src/space-authoring.ts` (`publish`) | yes | yes | yes |

`space-authoring.ts` carries a comment explaining why copying matters — a `Set`
visits entries added mid-iteration, so a listener subscribing during publication
is notified about a state it was not watching, a number of times that depends on
where it was added. `session.ts` does not copy. Nothing pins its behaviour either
way; `space-authoring.test.ts` pins only Authoring's.

`isThenable` is defined twice, with near-identical explanatory comments:
`packages/persistence/src/session.ts:43` and
`packages/app/src/space-authoring.ts:168`. `safelyReport` likewise.

Navigation's bare publisher was the reachable throw inside the install window
that `62023a4` made total. That fix removed the consequence; the divergence
itself is still here.

## Direction

One observable-state module holding `getState`/`subscribe`/`publish`, with the
copy, the containment, the thenable interception and the error reporting in one
place. Each collaborator keeps its own interface and its own state — only
notification moves behind the seam.

## Constraint that must survive

Observable-state notification remains non-throwing: it contains synchronous
observer failures and asynchronous rejections, continues to later observers and
reports diagnostics through an injected non-throwing sink. This seam should not
absorb unrelated error policies such as HTTP logging unless they become actual
consumers of the same observable-state contract.

## Verification

`pnpm verify` and `pnpm e2e`. Behaviour-preserving, so e2e must be green and
unchanged.
