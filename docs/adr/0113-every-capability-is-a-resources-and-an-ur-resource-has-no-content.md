# Every capability is a Resource's, and an Ur Resource has no content

Status: accepted
Refines: 0051
Refined by: 0120, 0121, 0122
Related: 0009, 0064, 0070, 0089, 0101, 0106

Every capability belongs to Resource, not to a kind. Every Resource is titled, placed, connected, Opened and Closed, resized, presented and referenced alike. A kind adds only the actions its content supports, and a difference in what Resources *can* do is tied to their kind and to nothing else. This governs capability, not availability: whether a capability is available at a given moment may still depend on interaction state (Close is disabled while content editing is live, ADR 0064), and structural invariants still refuse Edits that would break them (an Edge needs both its Resources on the Map). Those apply to every kind alike. ADR 0051 gave a kind everything beyond the Title. This ADR states the converse: a kind takes nothing away.

**Reference is the terminal exception.** A Reference Resource may not be a Reference Resource's Target (ADR 0009, ADR 0089): if B references A, C may not reference B. Referencing is single-hop, so a reference always ends at content of its own. The exception is tied to the Reference kind, which is what keeps it inside the rule: it says what the Reference kind's content is, a view of another Resource's content, and nothing about any other kind. No other kind takes a capability away.

The first kind built under that rule is the **Ur Resource**, kind `ur`. Its content is empty, so it is the simplest Resource there is: a Title and every capability every Resource has. It exists so an author can diagram, drawing named things and the Edges between them, without each of those things being a Markdown document. Its kind offers no content action, so it has no Edit. Open is the ordinary Open and shows nothing beyond the Title. Presenting draws it as its Title, as a stop like any other Resource. A Reference Resource may target it. It is created as a fourth peer in the Command Dock's creation cluster, completing on activation (ADR 0089). Its kind is fixed at creation, as every kind's is.

The name is the English prefix for the original and most primitive of a thing (ur-text), and the urelement of set theory: a member of sets that has no members. It is kept although not every reader will recognise it at first. The plain alternatives either describe every Resource's front (box, shape) or imply content (note), and each would be wrong in a way that is harder to unlearn than an unfamiliar word.

## Considered options

- **A Reference Resource that targets itself.** Its content would be its own identity, and it could not be opened. Rejected. Resolving a self-Target answers the Resource itself, so "cannot be opened" would still be a rule written as `target === id` in the resolver, the Open command and the rail: a rule tied to a Target's value rather than to a kind. It would give "Reference" two meanings, break the rule that a Reference Resource never targets itself, and still need a creation gesture of its own. It also took Open away, which the capability rule above does not allow for any kind.
- **A Markdown Resource with an empty body.** This is already valid. Rejected as the answer, because it still offers Edit and a body to grow into: it is a document that happens to be empty, not a thing with no content.
- **A kind that cannot be Opened.** Rejected under the capability rule. Open/Closed is Map-owned for every Resource (ADR 0064).
- **A presenting traversal that passes through an Ur Resource without stopping.** Rejected. It would make an Edge mean different things depending on the kind it reaches.

## Consequences

The schema, intake, export and import gain a fifth kind arm with no fields beyond the frontmatter every Resource has. `resolveResourceContent` answers empty content for it, both for itself and through a Reference Resource. Which kind the Option/Alt empty drop and Connect to Resource's New Resource row mint is unchanged (Markdown), and remains a separate decision.
