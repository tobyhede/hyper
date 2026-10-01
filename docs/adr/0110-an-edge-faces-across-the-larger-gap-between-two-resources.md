# An Edge faces across the larger gap between two Resources

Status: accepted
Refines: 0087
Related: 0032, 0084, 0100

ADR 0087 decided that an Edge attaches to the anchor on the side of each Resource that faces the other, chosen while drawing. It described that rule as dividing by the vector between the two centres. The built rule does not. `facingSides` in `packages/react-flow-adapter/src/edge-attachment.ts` chooses the side in two steps:

1. **The axis is the one with the larger gap between the two rects.** A gap is how far apart the rects are on that axis: positive when they are clear of each other, negative by the depth of the overlap when they are not. So two rects clear horizontally and overlapping vertically take the horizontal axis, and two rects overlapping on both axes take the axis they overlap on least. Equal gaps take the horizontal axis.
2. **The side on that axis is the sign of the centre difference on that axis alone.** A target whose centre is at or past the source's leaves the source's Right (or Bottom) and enters the target's Left (or Top). Otherwise it goes the other way. The other axis's centre difference is never read.

`packages/react-flow-adapter/test/edge-attachment.test.ts` holds each case, including both ties.

## Why the gap and not the centre vector

A Resource is 260×146 collapsed and several times that open, and ADR 0084 moves neighbours when one opens, so a large Resource beside a small one is the normal state of a Map. Picture a tall Open Resource with a collapsed one sitting beside its lower edge. They are side by side: clear horizontally, overlapping vertically, and an author reading them sees the Edge cross the horizontal gap. But the tall Resource's centre is far above the small one, so the centre vector's vertical component is the larger, and a rule reading that vector attaches the Edge top-to-bottom, crossing the Resource. Reading the gap between the rects gets this pair right whatever their sizes.

Once the axis is fixed, the centre difference on it is the only fact that can say which way along it the target lies, including when the rects overlap.

## Self-Edges

The general rule does not divide by anything, so a self-Edge would not produce a `NaN`. It would produce a plausible wrong answer: one rect against itself overlaps on both axes, the shallower overlap picks the axis (vertical, for a Resource wider than it is tall), and the coincident centres fall to Bottom leaving and Top entering, which draws the loop straight through the Resource. ADR 0087's decision therefore stands for a new reason. A self-Edge takes its fixed loop (`selfEdgeAttachment`, Right to Top) before the general rule is asked, and never enters it.

## Rejected

**The centre-to-centre vector**, whether compared component by component or divided into an angle. It answers equal-sized Resources correctly and large-beside-small ones wrongly, and the second is the case this canvas is made of.
