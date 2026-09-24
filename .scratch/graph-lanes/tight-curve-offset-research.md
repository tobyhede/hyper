# Offsetting a lane past a bend tighter than its distance

Status: research, no code changed. Answers the open limit in `issues/04` "Review follow-up".

## Question and context

`laneBezier` (`packages/react-flow-adapter/src/edge-lanes.ts`) draws a lane as the lone curve offset along its normal (ADR 0103). `offsetHolds` requires the radius of curvature ρ > 2·reach at every one of 65 samples, and otherwise the whole pair falls back to the translate that ADR 0100 drew. On the reported attachment (Right→Left, source (0,0), target (100,300)), React Flow answers `M0,0 C50,0 50,300 100,300`. I confirmed this against the installed `@xyflow/system@0.0.79` `getBezierPath`. Here ρ is 12.5 at t=0, 17 at 0.05, 39 at 0.1, 176 at 0.2 and 540 at 0.3, and the curve is straight at 0.5. So the check fails only in the first and last ~12% of the parameter range, and the whole pair is translated for it.

What any fix has to keep: the lane ends stay beside their anchors, moved along the Resource side. Arrowheads do not change. Lanes never cross and are never fanned. The trim is measured along the lane. And no lane is ever drawn worse than the translate. `laneBezier`'s signature stays `(attachment, offset, endTrim, reach)`.

Two facts about this curve decide most of what follows.

1. **The end constraint and a constant distance cannot both hold at a tight end.** The anchor point for the 24 lane is (0,24), and it is only 19.93 from the centre curve (the 16 lane's (0,16) is 15.30 away). The centre dives to (13.6, 8.4) by t=0.1. So no construction can hold the distance near that end: the pinned end is already inside it. What a construction *can* do is hold the distance wherever the bend allows and get from the anchor to that stretch without folding.
2. **The folding happens on one side only.** Signed curvature is positive near the source and negative near the target. So positive lanes are inside the source bend and outside the target bend, and the one negative lane (−4, the Active Graph's reverse direction) is the other way round. An offset cusps only on the inside of a bend, where κ·d = 1 (Farouki & Neff 1990; Levien 2022: "The cusp happens when κd + 1 = 0", in his sign convention).

A note on the reported numbers: by exact distance to the centre polyline (3,000 samples, point-to-segment), I measure the translated lanes at 8, 16 and 24 as coming within **1.32, 2.63 and 3.95** of the centre, not the reported 6.1, 4.9 and 4.1. At t=0.5 the tangent is (25,150)/|·|, so the translate's gap is 8·25/152 = 1.32. The difference is probably coarser sampling in whatever produced the brief's figures; I did not verify that. Either way the translate is the thing to beat.

All numbers below come from throwaway scripts (`lanes.mjs`, `lanes2.mjs`, `sweep*.mjs`, `measured.mjs` in this session's scratchpad, not in the repo). They use the exact cubic, 600 to 4,000 parameter samples, and exact point-to-polyline distance. "Gap" is the nearest a lane comes to its inner neighbour (the centre for the first lane). "Sharp turns" counts places where the lane turns more than 60° between consecutive samples, which is a cusp or swallowtail.

## Findings per approach

### 1. Variable-distance offsets (taper d toward the ends or where ρ is small)

**Sources.** Variable-distance offsetting is established: Elber & Cohen (1991) give an error-bounded variable-distance offset operator for free-form curves, including detecting and trimming loops. Lin & Rokne (1997) treat variable-radius offset curves; I could only see the listing, because ScienceDirect returned 403, so its content is **unverified**. Pomax's primer implements "graduated offsetting": the distance is linearly interpolated along arc length, `map(S+d1, 0,L, s,e)`, and each reduced sub-curve's points are moved along the normal by it (Primer, "Graduated curve offsetting").

**On our curve.** Tapering fails the end constraint by construction. The tightest bend is at the anchor, so d(0) = min(d, k·ρ(0)) is less than d, and the lane's end leaves its anchor-side position (with k = ½, d(0) = 6.25 for every lane). I tried d(t) = min(|d|, ρ(t)/2) on the inside of the bend. It never folds, but every lane is clamped to the same ρ/2 near the source, so the lanes **collapse onto each other**: the 8|16 and 16|24 gaps are 0.00. That is worse than the translate. Tapering by arc length over 4·|d| from each end gives gaps of 6.12, 1.41 and 0.00, and the lanes cross. A fixed ramp length of 96 gives 4.25, 3.78 and 3.09 with no crossings, but that is still a blend in disguise (see 3).

**Verdict.** Rejected. It moves the lane ends off the anchors, and several lanes tapered by one rule meet.

### 2. Full offset, then trim the self-intersection

**Sources.** Tiller & Hanson (1984) is the construction `tillerHanson` already uses. Elber, Lee & Kim (1997) compare offset-approximation methods; Levien (2022) suspects their error measurement "may overestimate error in the case where the two curves being compared differ in parametrization". Farouki & Neff (1990) characterise the singularities: a regular generator's offset at distance d is irregular where κ = −1/d. That is usually a cusp, or an extraordinary point if κ is also extremal there. Seong, Elber & Kim (2006) trim local and global self-intersections using a distance map between the curve and its offset: offset points nearer the base curve than d are the ones cut away.

**On our curve.** The exact offset holds 8 everywhere for the 8 lane. For 16 and 24 it runs backwards for a stretch after the source (182 and 288 backward sample steps out of 4,000) and has a sharp turn at the cusp. Trimming by the distance-map criterion keeps the offset only from t = 0.064 (for 16) and t = 0.107 (for 24). The trimmed-away part is a **tail that contains the lane's own start point**, not a closed loop. That is fact 1 again: trimming alone leaves the lane starting somewhere other than beside its anchor. So trimming needs a join from the anchor to the first kept point. Section "Recommendation" builds that join, and it is what I recommend.

**Verdict.** The right basis. It has to be completed with a join back to the anchor, and the trim point has to be chosen once per pair.

### 3. Blending from a translate at the ends to a true offset in the middle

**Sources.** I found no primary source that proposes this for offsets. It is the obvious generalisation of approach 1, with the offset direction interpolated instead of the distance.

**On our curve.** L(t) = C(t) + d·[(1−w)·n₀ + w·n(t)], with w chosen so that w·κ·d ≤ ½ (made monotone toward the middle). The ends are exact, because both the translate and the offset put t=0 at the anchor moved along the side. But the lane's velocity picks up a term d·w′·(n − n₀), and near the source that term points backwards. So the blend **still folds**: one sharp turn on each of the 16 and 24 lanes. It is also no better than a trim at spacing: gaps 7.9, 5.84 and 2.03, or 6.74, 4.85 and 2.03 when judged at reach. With the normalised direction it is 14.17 and 18.4 from the centre, still with folds.

**Verdict.** Rejected. The ramp's own derivative folds the lane, and the result is worse than approach 2 plus a join.

### 4. Clamping the per-point offset to the local radius

This is approach 1 with k·ρ as the clamp. Numbers above: the ends leave the anchors, and the lanes collapse onto each other (gaps 6.14, 0 and 0). **Rejected** for the same reasons.

### 5. What production renderers and graph libraries do

**Stroke renderers do not trim. They let the fill hide the fold.** A stroke's outline is filled with nonzero winding, so a swallowtail on the inner side of a tight bend is painted over. For a thin lane stroked *along* the offset, that trick is not available: the fold is drawn.

- **Skia** `SkPathStroker::cubicTo` splits the cubic at its inflections. It strokes an outer and an inner side for each part (`kOuter_StrokeType` then `kInner_StrokeType`, SkStroke.cpp L1376–1386), with separate `fInner`, `fOuter` and `fCusper` builders (L232). Where the *source* cubic has a cusp it adds a full circle of the stroke radius (L1387–1392). The inner side is not trimmed.
- **kurbo** (Levien) `offset_cubic` (offset.rs L108) finds the parameter where "curvature of the source curve times offset plus 1" changes sign (`cusp_sign`, L152–166). It subdivides there so each side is fitted separately (L191–218), which means it *keeps* the cusp and fits the curve on either side accurately. `stroke` says it computes "parallel curves and adding joins and caps, rather than computing the rigorously correct parallel sweep (which requires evolutes in the general case)" (stroke.rs L250–258, citing Nehab 2020). It uses a round join at a cusp "to model cusp as limit of finite curvature" (L579).
- **Nehab (2020)**, "Converting stroked primitives to filled primitives", is the reference both of them cite for what a correct stroke needs at such points.
- **Blend2D** finds the cusp parameters of each offset quad (`quad_offset_cusp_ts`, pathstroke.cpp L856–858) and splits cubics at cusps and inflections (L335–452), then offsets each piece. It keeps the fold and relies on the fill.
- **Cairo** flattens the spline and strokes each piece with faces. It inserts a join only where adjacent faces turn by more than a tolerance-derived angle (`spline_cusp_tolerance`, cairo-path-stroke.c L141–151, used at L1029–1030). The fill covers the overlap.
- **Pomax's bezier.js** `offset(d)` reduces the curve into "simple" pieces and scales each (bezier.js L520–555). `simple()` requires both control points on one side of the baseline and end normals within 60° (L557–570). The primer says why: "you can't offset a Bézier curve with another Bézier curve". The same approach offers nothing for ρ < d, where the offset of each piece still folds.
- **Paper.js** has no offset in its core. The third-party `paperjs-offset` detects self-intersections and "inward distance collapse" and picks among strategies by score (README). Its behaviour is not documented beyond that.

**Graph drawing libraries do not attempt constant distance along curves.** They fan the curves or run parallel polylines.

- **Cytoscape.js** `curve-style: bezier` bundles parallel edges, "each … a quadratic bezier curve, separated from the others by varying the curvature". `control-point-step-size` is the distance between successive edges measured "along the line perpendicular from source to target", at the control point (style.md L406–411). This is fanning: all the curves meet at the endpoints.
- **Graphviz dot** routes one spline for a multi-edge set and makes the others by shifting its *interior* points in x by `Multisep` (= `nodesep`), leaving the end points (dotsplines.c L1892–1907, `Multisep` at L275). That is a fan on a fixed axis, not an offset. `concentrate=true` merges multi-edges into one instead (Graphviz `concentrate` docs).
- **yFiles** `ParallelEdgeRouter` routes a "leading edge" and reinserts the others as "parallel segments" at `edgeDistance` (default 10), optionally with `joinEnds` (yFiles for HTML API). It works on polyline segments.
- **ELK** offers `spacing.edgeEdge`, whose docs note spacing "can somewhat easily be satisfied for the segments of orthogonally drawn edges, [but] is harder for general polylines or splines". I found no ELK feature that draws multi-edges as offset curves. This is **unverified beyond the option docs**.
- **LOOM** (Bast, Brosi & Storandt) is the one system that truly draws lines side by side along one course. It renders each line "by perpendicular offsetting the edge's geometry τe by −w|L(e)|/2 + w(pe(l)−1)". It then *expands the node fronts* and joins lines inside the node with cubic Béziers (§5, Rendering). The lesson for us is the same as approach 2: offset where the geometry allows, and bridge to the fixed ends with a separate cubic.

### 6. Changing the centre curve (gentler control legs for bundled pairs)

**Sources.** Changing the base curve so that its offset has no local self-intersection is studied in CAD: "Modifying free-formed NURBS curves and surfaces for offsetting without local self-intersection" (listed on ResearchGate; authors and venue **unverified**). In graph drawing, Cytoscape and Graphviz both change the curve per edge, but that is fanning, which ADR 0100 rejects.

**On our curve.** At t=0, ρ = 1.5·L²/h, where L is the first control leg and h the rise across the facing axis (1.5·50²/300 = 12.5). To reach ρ ≥ 2·24 at the anchor, L would have to be about 98, which is almost the whole 100 units of forward run. With `C98,0 2,300 100,300` the curve's x stops being monotone and it bulges back. React Flow's forward control offset is fixed at half the distance (`calculateControlOffset`), so no parameter reaches this.

**Cost.** React Flow would stop being the author of the centre curve (ADR 0103), and a Map would draw the Active Graph's own Edge differently depending on whether other Graphs share the pair. **Rejected.**

## Recommendation for this codebase: offset the middle, bridge the ends, one span per pair

**Construction** (approach 2 completed as LOOM does at node fronts):

1. From the centre cubic and the pair's `reach`, find one parameter span [t₀, t₁] around t = ½. It is the widest span over which three things hold:
   - (a) the bend allows an offset at both +reach and −reach: |κ(t)|·reach < ½, the same threshold `offsetHolds` uses;
   - (b) the offsets at ±reach run forwards along the facing axis;
   - (c) a single bridge cubic from each moved anchor to the offset at t₀ or t₁ has a control polygon that runs forwards along the facing axis. That is a sufficient condition for the bridge itself running forwards. The bridge's handles are shortened to fit: α = min(chord/3, Δ/2) along the facing axis at the anchor, and β = min(chord/3, (Δ−α)/Tₓ) along the offset's tangent at the landing point.

   The span depends only on the centre and `reach`, so **every lane of a pair lands at the same t₀ and t₁**. This is essential. With a landing parameter per lane, my sweep produced 11 crossings out of 144 cases, because an outer lane's bridge cut across an inner lane's offset. With one span per pair it produced none.
2. The lane is:
   - a bridge cubic from `anchor + offset·side` to O_d(t₀), leaving along the side's facing direction and arriving along the offset's tangent (which equals the centre's tangent at t₀, since 1 − κd > 0 there);
   - `offsetPieces` of the centre split to [t₀, t₁];
   - a bridge cubic from O_d(t₁) to the target anchor moved along its side.

   Where t₀ = 0 and t₁ = 1, the lane is exactly what `laneCurve` draws today.
3. If no such span exists (the anchors are close along the facing axis and far apart across it, so a lane at reach would sit behind the source side in the steep middle), fall back to the translate as today. The reversed-target and level-anchor guards in `offsetHolds` stay as they are.

**On the measured curve** the span is t ∈ [0.177, 0.823]:

| construction | gap 0\|8 | gap 8\|16 | gap 16\|24 | gap in drawn middle 60% | sharp turns |
|---|---|---|---|---|---|
| translate (current) | 1.32 | 1.32 | 1.32 | 1.32 | 0 |
| exact offset, untrimmed | 8 | 7.30 | 3.93 | 8 / 8 / 8 | folds on 16 and 24 |
| offset + bridges, one span per pair | 7.41 | 6.97 | **5.00** | **8 / 8 / 8** | 0 |

- The remaining pinch of 5.00 is between the 16 and 24 lanes at the 24 lane's own anchor point (0,24). As fact 1 says, that point is fixed and already 19.93 from the centre, so no construction that keeps the ends where they are can clear it.
- **With an Active Graph**, the lanes at 8, 16 and 24 are detached and trimmed by a fifth at each end. The trim removes the bridges entirely, and what remains is exactly 8 apart.
- **With no Graph active**, every lane is drawn in full with an arrowhead. The bridges show, and each arrives along the facing axis, so the arrowhead's direction does not change.

**Sweep** over Right→Left forward attachments: dx ∈ {20, 40, 60, 100, 160, 240} × dy ∈ {0, 20, 120, 300, 500, 900} × lane sets {0/8/16/24, −4/4/12/20, 0/8, −4/4/12}, 144 cases.

- 122 were bridged and 22 fell back to the translate. All of the fallbacks have dx ≤ 40 and dy ≥ 120.
- In no case was the minimum neighbour gap worse than the translate's (tolerance 0.05).
- No case had a gap below 0.5, and none had a sharp turn.
- Typical wins: (160, 500) goes from 1.26 to 7.16; (240, 900) from 1.06 to 7.79; (60, 900) from 0.27 to 1.38.
- Not covered: Top/Bottom (the same geometry with the axes swapped), reversed targets and level anchors (unchanged guards), and asymmetric Resources. These are a prototype's numbers, not a proof.

**How it fits `laneBezier` without changing its interface.** It is entirely inside `laneCurve`:

- Replace `if (!offsetHolds(centre, reach)) return movedCurve(…)` with `const span = offsetSpan(centre, reach)`, returning `[t0, t1] | undefined`, and translate when it is `undefined`.
- Keep the direction, level-anchor and reversal checks inside it.
- Then build `[bridge(start), ...offsetPieces(middle, offset, side, 0), bridge(end)]`, omitting a bridge whose span end is 0 or 1. `split` already exists. The anchor-pinning `ends` map continues to apply to the first and last piece.
- `label` stays `offsetPoint(centre, 0.5, …)`, since ½ ∈ [t₀, t₁].
- `trimmed` already works over joined pieces and measures along the lane.
- `GraphLane.reach` already carries what the span needs, so `graphLanes` and the projection are untouched.

**Invariants kept:**

- **Ends beside anchors.** The bridge starts at `anchor + offset` along the side and leaves along the facing axis.
- **Arrowheads unchanged.** The last bridge arrives along the facing axis at the same point.
- **Lanes ordered and never crossing.** There is one span per pair, and the lanes are offsets of one curve on one normal in the middle. Measured: 0 crossings.
- **Draws forwards.** The bridge control polygons run forwards by construction, and the span requires the offsets to run forwards.
- **Trim measured along the lane.** Unchanged.
- **Never worse than the translate.** Measured, not proved. See the tests, and consider making it a runtime guard (below).
- **Not fanned.** In the middle every lane is at its distance, and the bridges bring each lane to its own anchor-side point, not to a shared point.

**Tests that would prove it** (in `edge-lanes.test.ts`, node environment, sampled geometry only, as the spec asks):

1. Example: `right(100, 300)` with reach 24. The lanes at 8, 16 and 24 each come nearer their inner neighbour than 4.5 nowhere. In the trimmed middle, each is within 0.5 of its offset from the centre. It is red today, because the lanes are translated and 1.32 apart.
2. Property, "never worse than the translate": for Left/Right and Top/Bottom attachments and a pair of 2–4 lanes, the smallest neighbour gap of `laneBezier` lanes is at least the smallest neighbour gap of the translated lanes minus 0.05. The translated lanes are built through `getBezierPath` over moved anchors, as the test file already does for self-Edges.
3. Relax the precondition of the existing distance property from `tightestRadius > 2·|offset|` to "sample inside the offset span". Every sample of the lane's middle is then within 0.5 of |offset|. This makes the property see the cases it discards today.
4. The existing properties stay unchanged: ends on the side line at the offset; each further lane further from the centre (`nearestApproach` drops five samples at each end, which already excludes most of the bridges); the lane and label never further along the facing axis than the lone curve; the lane runs forwards; trim example; lone Edge is React Flow's bezier; level lanes straight.
5. Regression: wherever today's `offsetHolds` passes, the path is byte-identical to today's, because t₀ = 0 and t₁ = 1 mean no bridges.

**Optional runtime guard.** Since "never worse than the translate" is measured rather than proved, `laneCurve` could compare the span-lane at `reach` against the translated lane at `reach` (one distance sample set) and translate if the span-lane is nearer. I would add this only if property 2 ever finds a counterexample: it costs a second path per lane.

**ADR 0103 needs amending.** Its "Where no offset is a copy of the curve, the lane is the curve moved whole" paragraph states the whole-curve rule: "The curve must bend no tighter anywhere than twice the lane's distance …". The new rule is: the offset is drawn over the widest central span where the bend allows it at the pair's reach and the lane runs forwards. Outside that span each end is a single cubic bridge from the anchor to the offset. The translate remains only for pairs with no such span. ADR 0103 exists only on this unmerged branch (`git log main -- docs/adr/0103-*` is empty), so amending it in place is honest. If it has merged by the time this is built, write a short ADR refining 0103 instead. Either way, keep the sentence that lanes are parallel and not fanned. The bridges do not fan: they converge on each lane's own anchor-side point, not a shared one.

## Sources

Papers:

- Tiller, W. & Hanson, E. G. (1984). Offsets of two-dimensional profiles. *IEEE CG&A* 4(9):36–46. https://doi.org/10.1109/MCG.1984.275995
- Farouki, R. T. & Neff, C. A. (1990). Analytic properties of plane offset curves. *CAGD* 7:83–99. https://doi.org/10.1016/0167-8396(90)90023-K (cusp condition κ = −1/d as summarised in the search abstract; I did not read the full text)
- Elber, G. & Cohen, E. (1991). Error bounded variable distance offset operator for free form curves and surfaces. *IJCGA* 1(1):67–78. Utah tech report: https://collections.lib.utah.edu/details?id=704657
- Elber, G., Lee, I.-K. & Kim, M.-S. (1997). Comparing offset curve approximation methods. *IEEE CG&A* 17(3):62–71. https://doi.org/10.1109/38.586019
- Lin, Q. & Rokne, J. G. (1997). Variable-radius offset curves and surfaces. *Mathematical and Computer Modelling*. https://www.sciencedirect.com/science/article/pii/S089571779700188X (content unverified: 403)
- Seong, J.-K., Elber, G. & Kim, M.-S. (2006). Trimming local and global self-intersections in offset curves/surfaces using distance maps. *Computer-Aided Design* 38(3):183–193. https://www.sciencedirect.com/science/article/abs/pii/S0010448505001491
- Nehab, D. (2020). Converting stroked primitives to filled primitives. *ACM TOG* 39(4). https://doi.org/10.1145/3386569.3392392
- Bast, H., Brosi, P. & Storandt, S. (2018/2019). Efficient Generation of Geographically Accurate Transit Maps (LOOM), §5 Rendering. https://arxiv.org/abs/1710.02226 ; ACM TSAS https://dl.acm.org/doi/10.1145/3337790
- "Modifying free-formed NURBS curves and surfaces for offsetting without local self-intersection" (listing only, authors and venue unverified). https://www.researchgate.net/publication/220583553

Author blogs and primers:

- Levien, R. (2022). Parallel curves of cubic Béziers. https://raphlinus.github.io/curves/2022/09/09/parallel-beziers.html
- Levien, R. (2021). Cleaner parallel curves with Euler spirals. https://raphlinus.github.io/curves/2021/02/19/parallel-curves.html
- Pomax. A Primer on Bézier Curves, "Curve offsetting" and "Graduated curve offsetting". https://pomax.github.io/bezierinfo/#offsetting ; chapter sources: https://github.com/Pomax/BezierInfo-2/blob/master/docs/chapters/offsetting/content.en-GB.md , https://github.com/Pomax/BezierInfo-2/blob/master/docs/chapters/graduatedoffset/content.en-GB.md

Library source code (pinned to the commit I read):

- Skia `src/core/SkStroke.cpp` @ 53eae726: https://github.com/google/skia/blob/53eae7263aaceacbae0e795757e52fd1903e098c/src/core/SkStroke.cpp#L1376-L1392 (inner and outer strokes, cusp circle); L232 (`fInner`, `fOuter`, `fCusper`)
- kurbo `kurbo/src/offset.rs` @ 3286440d: https://github.com/linebender/kurbo/blob/3286440db6df3ff1f905ec398407b1d0e7cff955/kurbo/src/offset.rs#L108 , #L152-L166 , #L191-L218 ; `kurbo/src/stroke.rs` https://github.com/linebender/kurbo/blob/3286440db6df3ff1f905ec398407b1d0e7cff955/kurbo/src/stroke.rs#L250-L258 , #L579
- Blend2D `blend2d/core/pathstroke.cpp` @ 58ca9460: https://github.com/blend2d/blend2d/blob/58ca9460b4138af6e793184682e9324e0a8053b2/blend2d/core/pathstroke.cpp#L335-L452 , #L856-L858
- Cairo `src/cairo-path-stroke.c` @ 74755964: https://gitlab.freedesktop.org/cairo/cairo/-/blob/74755964edef651691d5cd36ff140108298e4e6e/src/cairo-path-stroke.c#L141-151 , #L1000-1030
- bezier.js `src/bezier.js` @ 4e767299: https://github.com/Pomax/bezierjs/blob/4e767299184ab4079dc8d7c970020103db14f431/src/bezier.js#L520-L575
- paperjs-offset README: https://github.com/glenzli/paperjs-offset/blob/master/README.md
- Graphviz `lib/dotgen/dotsplines.c` @ c5401be8: https://gitlab.com/graphviz/graphviz/-/blob/c5401be8aa02b41346e60fb7f51d6d240b2b24d0/lib/dotgen/dotsplines.c#L1892-1907 (and L275, `Multisep`)
- Cytoscape.js `documentation/md/style.md` @ 716a1cb6: https://github.com/cytoscape/cytoscape.js/blob/716a1cb6c6015d57b674abe626deaeb5e817ee30/documentation/md/style.md#L406-L411
- React Flow `getBezierPath`, `@xyflow/system@0.0.79` as installed in this repo (output checked locally).

Official docs:

- Graphviz `concentrate`: https://graphviz.org/docs/attrs/concentrate/
- yFiles for HTML `ParallelEdgeRouter`: https://docs.yworks.com/yfiles-html/api/ParallelEdgeRouter.html
- ELK `spacing.edgeEdge`: https://eclipse.dev/elk/reference/options/org-eclipse-elk-spacing-edgeEdge.html
