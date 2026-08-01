# React Flow official agent/LLM resources and best-practice guidance — research findings

Research date: **2026-07-23**. All probes and fetches done on that date unless noted.

Version scoped to: **`@xyflow/react` 12.11.2** (what's installed — `packages/app` and `packages/react-flow-adapter` both declare `"@xyflow/react": "^12.3.5"`, pnpm resolved `12.11.2`, with `@xyflow/system@0.0.79`). Verified via `pnpm ls @xyflow/react -r`.

Primary sources only: `reactflow.dev`, `xyflow.com`, `github.com/xyflow/*`. Two secondary links are noted and clearly marked — both are ones React Flow's own docs link out to.

---

## 1. Verdict up front

**What exists (official):**

- **`/llms.txt`, `/llms-medium.txt`, `/llms-full.txt` on `reactflow.dev`** — all HTTP 200. This family is the only agent-facing artefact xyflow ships. Announced [2026-03-19](https://reactflow.dev/whats-new/2026-03-19) and written up [2026-03-25](https://xyflow.com/blog/llms-txt-agent-skills-ai-development).
- Substantial, current, first-party **prose guidance** across Learn → Customization / Layouting / Advanced Use / Troubleshooting, all of which is *inside* `llms-full.txt`, so one fetch gets the lot.

**What does not exist (checked, negative results):**

- **No Agent Skill.** xyflow built one as an experiment, evaluated it, and shelved it. Their words: *"for now it seems like writing these skills takes too much effort and current LLMs already appear to have a great handle of React Flow already"* ([xyflow blog, 2026-03-25](https://xyflow.com/blog/llms-txt-agent-skills-ai-development)).
- **No MCP server.** Also explicit: *"We're just focusing on documentation and decided an MCP server wouldn't be the right fit for now"* ([same post](https://xyflow.com/blog/llms-txt-agent-skills-ai-development)). The MCP servers that show up in search are all third-party.
- **No Cursor rules, no `AGENTS.md`, no `CLAUDE.md`, no `.claude/skills`** anywhere in the `xyflow` GitHub org (see §4 for the exact probes).
- The post closes with *"we're pausing our investigations into AI for now"* — so treat `llms.txt` as the stable surface and don't expect skills/MCP soon.

**Practical upshot for this repo:** the highest-leverage move is to point an agent at `https://reactflow.dev/llms-full.txt` (895 KB, one document, no navigation) or the lighter `llms-medium.txt` (782 KB) when working in `packages/react-flow-adapter`. There is nothing to install, register, or vendor.

---

## 2. Official agent/LLM resources — URLs and status

Probed with `curl -s -o /dev/null -w "%{http_code} %{size_download}" -L` on 2026-07-23.

| URL | Status | Size | Notes |
| --- | --- | --- | --- |
| <https://reactflow.dev/llms.txt> | **200** | 40,797 B | Index: headings + annotated links, llmstxt.org format |
| <https://reactflow.dev/llms-medium.txt> | **200** | 781,741 B | Learn section + React Flow UI component docs |
| <https://reactflow.dev/llms-full.txt> | **200** | 895,168 B | The above + full example source + entire API reference |
| <https://svelteflow.dev/llms.txt> | **200** | 28,928 B | Sibling library, same treatment |
| <https://reactflow.dev/sitemap.xml> | **200** | 330 `<loc>` entries | Contains the three llms files; no AI/MCP/agent pages |
| <https://reactflow.dev/llms-small.txt> | 404 | — | Not published (the standard's "small" variant is absent) |
| <https://reactflow.dev/.well-known/llms.txt> | 404 | — | Not published at the well-known path |
| <https://xyflow.com/llms.txt> | 404 | — | Only the docs sites publish these, not the company site |
| <https://reactflow.dev/mcp> | 404 | — | No MCP endpoint |
| <https://reactflow.dev/ai>, <https://reactflow.dev/docs/ai> | 404 | — | No AI landing page |

`llms-full.txt` served `date: Wed, 22 Jul 2026 13:01:09 GMT` with `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800` — i.e. build-time static, refreshed daily at the CDN. The blog post documents exactly this: a Next.js route with `export const dynamic = 'force-static'`, generated from Nextra's `getPageMap`, so the files stay in sync with the docs by construction ([source](https://xyflow.com/blog/llms-txt-agent-skills-ai-development)).

`llms.txt` self-describes the doc tree — Guides (Core Concepts, Customization, Layouting, Advanced Use, Tutorials, Troubleshooting), Examples, UI, API Reference. Useful as a cheap map before pulling the 895 KB file.

### The one "AI" page in the sitemap is a product template, not agent tooling

<https://reactflow.dev/ui/templates/ai-workflow-editor> — a React Flow UI template for building AI-workflow *editors*. Not relevant here.

### Third-party, for completeness (not endorsed by xyflow)

Search surfaces `orkait/reactflow-mcp-server`, `@yeshsurya/react-flow-mcp-server`, `antxonx/react-flow-mcp`, and `thedogwiththedataonit/react-flow` ("React Flow skills for coding agents"). **None are linked from reactflow.dev, xyflow.com, or the `xyflow` org**, so none is endorsed. That is the extent of what was checked — their contents were not inspected, so nothing here says what they contain or where they source it. If you evaluate one, `llms-full.txt` is the first-party material to compare it against.

---

## 3. Official best-practice guidance by topic

Everything below is quoted or paraphrased from first-party docs, read via `llms-full.txt` as fetched 2026-07-23; canonical page URLs given alongside.

### 3.1 Performance — <https://reactflow.dev/learn/advanced-use/performance>

Four documented strategies:

1. **Memoize components.** *"Components provided as props to the `<ReactFlow>` component, including custom node and edge components, should either be memoized using `React.memo` or declared outside the parent component."*
2. **Memoize functions and object/array props.** *"functions passed as props to `<ReactFlow>` should be memoized using `useCallback`… Additionally, arrays and objects like `defaultEdgeOptions` or `snapGrid` should be memoized using `useMemo`."*
3. **Never read `nodes`/`edges` wholesale in a component.** *"One of the most common performance pitfalls in React Flow is directly accessing the `nodes` or `edges` in the components or the viewport."* The documented fix is to derive the narrow thing you need (e.g. `selectedNodeIds`) into a separate store field so the component re-renders only when *that* changes.
4. **Collapse large node trees** via the node `hidden` flag, and **simplify node/edge CSS** (animations, shadows, gradients) as a last resort.

> **Actionable here:** `CardNode` (`packages/react-flow-adapter/src/CardNode.tsx`) and `RoutedEdge` (`packages/react-flow-adapter/src/RoutedEdge.tsx`) are **not** wrapped in `React.memo`. They *are* referenced from module-level `nodeTypes`/`edgeTypes` constants in `packages/react-flow-adapter/src/index.ts`, which satisfies the "declared outside the parent component" half of rule 1 — but the memo half is still on the table if node counts grow. Rule 2 has one live miss: `packages/app/src/components/GraphView.tsx:45` passes an inline arrow for `onNodeClick`, recreated every render. `packages/app/src/App.tsx` already does the right thing for the `nodes`/`edges`/`graph` derivations (`useMemo` throughout). Rules 3 and 4 are not currently violated — nothing in the repo calls `useStore`.

### 3.2 Troubleshooting / common errors — <https://reactflow.dev/learn/troubleshooting/common-errors>

Sixteen numbered warnings. The ones that bite an adapter like this one:

- **#002 "It looks like you have created a new nodeTypes or edgeTypes object."** Define them outside the component or `useMemo` them. *(This repo already complies.)*
- **#004 "The React Flow parent container needs a width and a height."** RF measures the parent DOM node; a bare `<div>` with no height renders nothing.
- **#008 "Couldn't create edge for source/target handle id."** Fires when *"a handle is not found by its `id` property or if you haven't updated the node internals after adding or removing handles programmatically."*
- **#010 "Handle: No node id found."** `<Handle />` used outside a custom node component.
- **#013 "It seems that you haven't loaded the styles."** `@xyflow/react/dist/style.css` or `base.css` must be imported.
- **#015** dragging a node without an `onNodesChange` handler. *(Stale as written: cards are draggable now and `onNodesChange` is wired. See §7.)*

**"Edges are not displaying correctly"** is the single most relevant subsection to this repo, and every bullet maps onto something the adapter does:

- *"If you want to hide your handles, do not use `display: none`… Use either `opacity: 0` or `visibility: hidden`."* Reason given in the Handles guide: *"React Flow needs to calculate the dimensions of the handle to work properly and using `display: none` will report a width and height of `0`."* `CardNode` already dims via the `opacity` style — correct by the book.
- *"if you have added more than one handle of the same type (`source` or `target`)… assign IDs to them. Multiple handles of the same kind on a node need to have distinguishable IDs."* This is exactly the per-route `<routeId>::out` / `::in` scheme — and it's the React Flow half of the invariant `AGENTS.md` records for the ELK half (`<cardId>##<handleId>`).
- *"If you are changing the position of the handles (via reordering, etc.), make sure to call the `updateNodeInternals` function returned by [`useUpdateNodeInternals`](https://reactflow.dev/api-reference/hooks/use-update-node-internals)."* **This is the one documented rule this repo has an unforced exposure to**: handle `offsetY` values change when ELK resolves (first paint is unlaid-out, then ELK's offsets land). Nothing calls `updateNodeInternals` today. It appears to work because node `data` changes force a re-render — but the docs treat that as insufficient, and it's the named cause of #008 and of misattached edges.
- *"make sure to correctly pass the `sourceX, sourceY, targetX, targetY`"* and *"`sourcePosition` and `targetPosition`"* into the path-creation function. `RoutedEdge`'s bezier fallback does pass all six — correct.

### 3.3 Custom nodes and handles — <https://reactflow.dev/learn/customization/handles>

- Multiple handles per side need unique `id`s; edges select them with `sourceHandle` / `targetHandle`.
- *"By default React Flow positions a handle in the center of the specified side. If you want to display multiple handles on a side, you can adjust the position via inline styles or overwrite the default CSS."* This is the officially sanctioned mechanism behind `CardNode`'s `style={{ top: handle.offsetY }}` — it is not a hack.
- **Dynamic handles:** *"If you are programmatically changing the position or number of handles in your custom node, you need to update the node internals with the `useUpdateNodeInternals` hook."* Same exposure as above; worth a ticket.
- Handles get `connecting` / `valid` class names during a connection gesture (irrelevant here — `nodesConnectable={false}`).

### 3.4 Custom edges — <https://reactflow.dev/learn/customization/custom-edges>

- Edge paths are always SVG, *"typically rendered using the `<BaseEdge />` component"*, with `getBezierPath` / `getSimpleBezierPath` / `getSmoothStepPath` / `getStraightPath` as the supplied path builders. `RoutedEdge` uses `BaseEdge` with a hand-built polyline `d` and a `getBezierPath` fallback — squarely inside the documented contract; `BaseEdge` takes an arbitrary `path` string.
- Register via an `edgeTypes` object defined **outside** the component, and set `type` on the edge. Already done.

### 3.5 Layouting, incl. elkjs — <https://reactflow.dev/learn/layouting/layouting>

React Flow ships **no** layout algorithm; the guide surveys dagre, d3-hierarchy, d3-force, elkjs, ordered *"from simplest to most complex, where dagre is largely a drop-in solution and elkjs is a full-blown highly configurable layouting engine."*

On elkjs specifically — worth reading as a temperature check on this repo's chosen seam:

> *"We don't often recommend elkjs because its complexity makes it difficult for us to support folks when they need it. If you do decide to use it, you'll want to keep the original [Java API reference](https://eclipse.dev/elk/reference.html) handy."*

and, deadpan, in the link list: *"Docs: <https://eclipse.dev/elk/reference.html> (good luck!)"*. Reference example: <https://reactflow.dev/examples/layout/elkjs>.

Also documented: *"because the layouting algorithm runs asynchronously we need to create a `useLayoutedElements` hook"* — matching this repo's uniformly-async `Layout` contract (`gridLayout` was made `async` to collapse the union; see `AGENTS.md`).

**Edge routing** gets its own short subsection, and it is the honest one:

> *"If you don't have any requirements for edge routing, you can use one of the layouting libraries above to position nodes and let the edges fall wherever they may. Otherwise, you'll want to look into some libraries and techniques for edge routing. Your options here are more limited than for node layouting."*

Their suggestions are [react-flow-smart-edge](https://github.com/tisoap/react-flow-smart-edge) and a Medium article on orthogonal connector routing *(secondary — linked from the primary doc, not verified here)*, plus the Pro "editable edge" example as a starting point. **Notably, taking ELK's own routed `sections` and drawing them via a custom edge — what `RoutedEdge` does — is not in their list.** So this repo's approach is beyond the documented path rather than contrary to it; there is no official guidance to contradict.

Honourable mentions for differently-sized nodes: `d3-flextree`, `entitree-flex`, `Cola.js` for constraint-based layouts.

### 3.6 Sub flows — <https://reactflow.dev/learn/layouting/sub-flows>

Not used in this repo, but two rules if it ever is:

- *"It's important that your parent nodes appear before their children in the `nodes`/`defaultNodes` array to get processed correctly."*
- Use `parentId` (renamed from `parentNode` in 11.11.0, old name removed in v12), and `extent: 'parent'` to confine children. Warning #005 fires if `extent` is set without a `parentId`.
- Caveat on layouting: *"Dagre currently has an open issue that prevents it from laying out sub-flows correctly if any nodes in the sub-flow are connected to nodes outside the sub-flow."*

### 3.7 TypeScript — <https://reactflow.dev/learn/advanced-use/typescript>

Directly relevant to a `strict` monorepo:

- Type custom nodes as `Node<DataShape, 'typeName'>` and consume via `NodeProps<MyNode>`. **Gotcha, called out with a ⚠ in the docs:** *"If you specify the node data separately, you need to use `type` (an `interface` would not work here)."* `CardNodeData` in `projection.ts` is already a `type` alias, with a comment giving the same reason — matches the doc.
- Custom edges get the identical treatment: `type CustomEdge = Edge<{ value: number }, 'custom'>` then `EdgeProps<CustomEdge>`.
- Build `Node`/`Edge` **union types** for the app and pass them as generics to `<ReactFlow />`, `OnNodesChange`, `useReactFlow<N, E>()`, `useStore`, `useNodesData<N>`. `BuiltInNode` / `BuiltInEdge` are exported to fold into the union.
- Narrow with **type-guard functions** (`node is NumberNode`) rather than casts.

> **Actionable here:** `RoutedEdge` is typed as bare `EdgeProps` and recovers its payload with `(data as RoutedEdgeData | undefined)` (`RoutedEdge.tsx:41-42`) — the documented alternative is `type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>` + `EdgeProps<RoutedFlowEdge>`, which deletes the cast. `CardNode` already does the node-side version correctly (`NodeProps<CardFlowNode>`). Also note 12.11.0 exports a `NodeHandle` type ([changelog](https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md)).

### 3.8 Controlled vs uncontrolled state — <https://reactflow.dev/learn/advanced-use/uncontrolled-flow> and <https://reactflow.dev/learn/advanced-use/state-management>

- **Controlled**: pass `nodes`/`edges` + `onNodesChange`/`onEdgesChange`, applying changes with the exported `applyNodeChanges` / `applyEdgeChanges`. *"You need to implement these handlers for an interactive flow (if you are fine with just pan and zoom you don't need them)."* — which is precisely this repo's situation. **Stale as written** — `onNodesChange` is wired and cards are draggable. `onEdgesChange` is still absent; see §7 for why that is not the defect it looks like.
- **Uncontrolled**: `defaultNodes` / `defaultEdges`, state owned by React Flow.
- The state-management guide is written around **Zustand** *"because React Flow already uses it internally"*, and demonstrates `useShallow` on the selector. Relevant given the app's Zustand store: the pattern is one selector returning a narrow object, wrapped in `useShallow`.

### 3.9 Testing — <https://reactflow.dev/learn/advanced-use/testing>

- *"If you want to test a React Flow application, we recommend to use Cypress or Playwright… React Flow needs to measure nodes in order to render edges and for that relies on rendering DOM elements."* **With Playwright, "no additional setup is needed."** This repo's split (Vitest for pure `core`/`graph` logic, Playwright for anything that has to actually render) is the officially recommended split.
- If you ever *do* want RF under jsdom/Vitest, the docs give a full `mockReactFlow()` shim (`ResizeObserver`, `DOMMatrixReadOnly`, `offsetWidth/offsetHeight`, `SVGElement.getBBox`) plus `waitFor` on `.react-flow__edge` for edge assertions, and advise `nodesDraggable={false} panOnDrag={false}` because *"d3-drag… does not work outside of the browser."*

### 3.10 Server-side rendering — <https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration>

Not an SSR project, but this page documents a **public API that is directly interesting for a layout-driven adapter**: a node may carry an explicit `handles: [{ type, position, x, y }]` array, because *"On the client, React Flow checks the positions of the handles and stores that information to draw the edges. Since we can't measure the handle positions on the server, we need to pass this information, too."* Likewise `width`/`height` (static) vs `initialWidth`/`initialHeight` (first-render-only, superseded by `measured.*`).

> **Possible lead:** since ELK already computes exact handle offsets, feeding them to React Flow as `node.handles` is the documented way to state handle geometry declaratively — a plausible alternative to the `useUpdateNodeInternals` remedy in §3.2/§3.3. Worth a spike, not a recommendation; the SSR framing means it's untested for this use.

### 3.11 Version notes relevant to v12+

- **Migration guide** — <https://reactflow.dev/learn/troubleshooting/migrate-to-v12>. The v11→v12 breaks that still shape idiomatic code: package renamed `reactflow` → **`@xyflow/react`**; measured dimensions moved to **`node.measured.width/height`** while `width`/`height` became inline-style inputs; **mutation of node/edge objects is no longer supported** (spread to a new object); renames `onEdgeUpdate`→`onReconnect`, `updateEdge`→`reconnectEdge`, `parentNode`→`parentId`, `xPos`/`yPos`→`positionAbsoluteX`/`positionAbsoluteY`, `nodeInternals`→`nodeLookup`; handle class names now `connectingto`/`connectingfrom`/`valid`; removed `getTransformForBounds`, `getRectOfNodes`, `project`, `getMarkerEndId`. New in v12: SSR, computing-flows hooks, `colorMode` dark mode, TSDoc in the published types.
- **Since the declared floor (`^12.3.5`) up to installed 12.11.2** — from the [changelog](https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md):
  - `12.11.2` is largely **render-performance work**: `MiniMap` no longer re-renders on every store update ([#5847](https://github.com/xyflow/xyflow/pull/5847)); the viewport transform is applied imperatively so `Viewport` renders once ([#5846](https://github.com/xyflow/xyflow/pull/5846)); `XYDrag` instances only created for draggable nodes ([#5825](https://github.com/xyflow/xyflow/pull/5825)).
  - `12.11.1` cuts **per-handle work on every store update** — shared handle config through context instead of a per-`Handle` store subscription ([#5818](https://github.com/xyflow/xyflow/pull/5818)) and a shared connection state while no connection is in progress ([#5817](https://github.com/xyflow/xyflow/pull/5817)). Meaningful for this repo: `CardNode` renders one `<Handle>` per route per card, so handle count scales with routes × cards.
  - `12.11.0` adds `autoPanOnSelection`, exports the `NodeHandle` type ([#5776](https://github.com/xyflow/xyflow/pull/5776)), and adds `@types/react` / `@types/react-dom` as **optional peer deps specifically to fix pnpm strict mode (`hoist: false`)** ([#5755](https://github.com/xyflow/xyflow/pull/5755)) — directly relevant to a pnpm workspace.
  - Dev warnings gained library-specific messaging and correct doc links in 12.11.0 ([#5793](https://github.com/xyflow/xyflow/pull/5793)), so console warnings from RF should now be self-navigating.
  - The `^12.3.5` range in both `package.json`s is satisfied by 12.11.2 with no action needed. No breaking change was identified in the changelog entries read (the 12.11.x line above); the intervening minors were not enumerated one by one, so treat that as "nothing found", not "nothing exists" — and revalidate when the lockfile moves.

---

## 4. Dead ends (negative results, all as of 2026-07-23)

- **No `llms-small.txt`** — `https://reactflow.dev/llms-small.txt` → **404**.
- **No well-known path** — `https://reactflow.dev/.well-known/llms.txt` → **404**.
- **No llms.txt on the company site** — `https://xyflow.com/llms.txt` → **404**.
- **No MCP / AI landing pages** — `/mcp`, `/ai`, `/docs/ai` all **404**; the 330-entry sitemap contains no `mcp`, `agent`, `skill`, or `cursor` URL. The only `/ai` hit is the `ui/templates/ai-workflow-editor` product template.
- **No agent config in the `xyflow` GitHub org.** Against `xyflow/xyflow`: `AGENTS.md` → 404, `CLAUDE.md` → 404, `.cursorrules` → 404, `.cursor/rules/` → 404, `llms.txt` → 404. Root tree is `.changeset .codespellrc .gitattributes .github .gitignore .npmrc .prettierignore .prettierrc.json CHANGELOG.md CODE_OF_CONDUCT.md CONTRIBUTING.md LICENSE README.md SECURITY.md dependabot.yml examples package.json packages pnpm-lock.yaml pnpm-workspace.yaml tests tooling turbo.json`.
- **Org-wide code search:** `org:xyflow filename:SKILL.md` → **0 results**; `org:xyflow path:.claude` → **0 results**; `org:xyflow filename:.cursorrules` → **0 results**. Across all 24 public org repos (`xyflow`, `pro-platform`, `vite-react-flow-template`, `awesome-node-based-uis`, tutorials, labs, …) there is no skills/rules directory.
- **Agent Skill: built and deliberately not shipped.** The blog documents a real evaluation — a custom-nodes skill plus Pro-example reference material, run through a baseline-vs-skill harness on Zed's agent with Claude Sonnet 4.6. The skilled run produced the *less* impressive app, and their reading was that *"its primary utility… is to keep the agent focused on the task."* Conclusion: not worth the maintenance.
- **No official guidance on rendering an external layout engine's edge routing.** The edge-routing subsection points at third-party libs and the Pro editable-edge example only; ELK `sections` are never mentioned. This repo is off-map here — deliberately, per `.scratch/layout-seam/issues/03-render-elk-edge-routing.md`.
- **Not investigated:** React Flow **Pro** examples (paywalled — `pro-platform` repo is the subscriber platform). If the team subscribes, the Pro "editable edge" example is the one the docs point at for custom-routed edges.

---

## 5. Actionable shortlist for `packages/react-flow-adapter`

**Superseded on 2026-08-01 — see §7.** Items 1–5 are resolved or reversed; do not act on the list below without reading §7 first. Item 1 in particular is now the opposite of this repo's verified position.

1. ~~**`useUpdateNodeInternals` when handle geometry changes.**~~ **Reversed.** Declaring `node.handles` (item 5) was built instead, and adding the hook on top is a regression — see §7.
2. ~~**Type `RoutedEdge` with the `Edge<Data, Type>` generic.**~~ Done.
3. ~~**`useCallback` the `onNodeClick` arrow in `GraphView`.**~~ Done, along with every other handler on the element.
4. **Consider `React.memo` on `CardNode` / `RoutedEdge`** — closed unless profiling says otherwise. The perf guide's rule is a disjunction (*"either memoized using `React.memo` **or** declared outside the parent component"*), and `nodeTypes`/`edgeTypes` are module-level constants, so it is already satisfied.
5. ~~**Evaluate declaring `node.handles`.**~~ Done and proven — `projection.ts`, `declaredHandles`.
6. **When agents work in this package, feed them `https://reactflow.dev/llms-full.txt`.** That is the whole of xyflow's official agent story. (§1, §2)

---

## 6. Sources

Primary:

- <https://reactflow.dev/llms.txt> — docs index for LLMs (200, 2026-07-23)
- <https://reactflow.dev/llms-medium.txt> — Learn + UI docs (200)
- <https://reactflow.dev/llms-full.txt> — full docs incl. examples + API reference (200; `date: 2026-07-22`)
- <https://reactflow.dev/sitemap.xml> — 330 URLs (200)
- <https://xyflow.com/blog/llms-txt-agent-skills-ai-development> — "Supporting AI development with React Flow and Svelte Flow", Hayleigh Thompson & Alessandro Cheli, **25 March 2026** (page footer: "Last updated on July 7, 2026") — the authoritative statement on llms.txt, agent skills, and MCP
- <https://reactflow.dev/whats-new/2026-03-19> — llms.txt endpoints announcement
- <https://reactflow.dev/learn/advanced-use/performance>
- <https://reactflow.dev/learn/advanced-use/state-management>
- <https://reactflow.dev/learn/advanced-use/uncontrolled-flow>
- <https://reactflow.dev/learn/advanced-use/typescript>
- <https://reactflow.dev/learn/advanced-use/testing>
- <https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration>
- <https://reactflow.dev/learn/customization/custom-nodes>
- <https://reactflow.dev/learn/customization/handles>
- <https://reactflow.dev/learn/customization/custom-edges>
- <https://reactflow.dev/learn/layouting/layouting>
- <https://reactflow.dev/learn/layouting/sub-flows>
- <https://reactflow.dev/learn/troubleshooting/common-errors>
- <https://reactflow.dev/learn/troubleshooting/migrate-to-v12>
- <https://reactflow.dev/examples/layout/elkjs>, <https://reactflow.dev/examples/layout/dagre>
- <https://reactflow.dev/api-reference/hooks/use-update-node-internals>
- <https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md> — 12.3.5 → 12.11.2
- GitHub API: `orgs/xyflow/repos`, `repos/xyflow/xyflow/contents`, `search/code?q=org:xyflow …`
- <https://svelteflow.dev/llms.txt> (200) — sibling library, cited only to confirm parity

Secondary (linked *from* the primary docs; not independently verified):

- <https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance>, <https://liambx.com/blog/tuning-edge-animations-reactflow-optimal-performance>, <https://www.youtube.com/watch?v=8M2qZ69iM20> — the three "Additional resources" the Performance guide links
- <https://medium.com/swlh/routing-orthogonal-diagram-connectors-in-javascript-191dc2c5ff70> and <https://github.com/tisoap/react-flow-smart-edge> — the edge-routing suggestions
- <https://eclipse.dev/elk/reference.html> — ELK's own Java reference, which the docs call your *"new best friend"* if you use elkjs

---

## 7. Reversals and resolutions — 2026-08-01

Re-reviewed against the same primary source (`llms-full.txt`) plus the installed `@xyflow/react@12.11.2` / `@xyflow/system@0.0.79`. Everything here was checked against a running app, not only read.

### 7.1 `useUpdateNodeInternals` — §3.2, §3.3 and item 1 are REVERSED

The docs still say what §3.2/§3.3 quote. It is the wrong remedy **here**, and following item 1 would reintroduce the bug it claims to prevent.

`projection.ts` declares `node.handles` from the strategy, and `parseHandles` in `@xyflow/system` builds `handleBounds` from those declarations without reading the DOM. The hook's forced path rebuilds them with `getHandleBounds`, which sees only anchors the DOM renders — dropping every not-yet-incident declaration, which is exactly what lets an Edge resolve in the render that first makes its target incident. Verified both ways against the fixture: with the hook, a second connection in one session fails with six #008 warnings; without it, it passes (`editing.spec.ts`).

The invariant is narrower than "don't call the hook". React Flow forces remeasures itself — `useResizeObserver` builds every update with `force: true`, and `useNodeObserver` forces on a change to `type`, `sourcePosition` or `targetPosition`. Both are harmless only because the card box is pinned to `CARD_SIZE` and those two props are never set on a card node. **That** is the rule to preserve.

### 7.2 Handle declaration order now matters

A non-incident anchor's fallback offset is `((index + 1) / (routeIds.length + 1)) * height`. With one Route that is exactly half the height — where the Left and Right authoring handles sit. React Flow picks the closest declared handle within `connectionRadius` and breaks an exact tie by array order, so the anchors used to win, and an anchor with no DOM element behind it is refused. The authoring handles are declared first now (`projection.ts`, covered in `projection.test.ts`). Not reproducible on the fixture, which has four Routes and so no exact tie.

### 7.3 Resolved since this document was written

- `isValidConnection` is wired, so a duplicate Edge is refused during the drag rather than silently dropped on release.
- `connectOnClick` was leaving a path armed that this design cannot complete, and a click on a handle opened the Card underneath. The handles now stop that click.
- `deleteKeyCode={null}` plus an `ariaLabelConfig` override: React Flow's default assistive text offered "Press delete to remove it" for a delete Hyper has not built.
- `connectionMode` is back to the default Strict. Loose only adds source-to-source, which this design refuses twice over.
- The `fitView` prop now carries `fitViewOptions`, so the first fit and `OverviewCamera` agree on `maxZoom`.
- Every handler and object prop on the element is memoized or module-level, per the perf guide's warning.
- `NewCardPreview` reads its point from `useConnection` (already in flow coordinates) rather than from per-frame state in `GraphView`.

### 7.4 Still open

- `nodes` is fed from two sources (`liveNodes ?? projectedNodes` in `App.tsx`), because `canvasContent` reports `arrangement` before `syncNodes` has run. The ownership filter in `editor.ts` absorbs the consequence. The documented Zustand pattern has one source.
- `projection.ts` writes `measured` onto projected nodes. The SSR page documents `width`/`height` as inputs and `measured` only as an output. It is load-bearing for the window above.
- `onEdgesChange` is absent while `elementsSelectable` is true. Measured: an edge click does clear the Card selection — but so does a click on bare canvas, which is React Flow's documented pane behaviour, and the edge never actually reads as selected because the controlled `edges` prop wipes it. No user-visible defect; `selectable: false` on projected edges would make the intent explicit at zero behavioural cost.
