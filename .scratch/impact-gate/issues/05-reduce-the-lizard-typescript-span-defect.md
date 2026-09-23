# 05: Reduce the lizard TypeScript span defect to a minimal repro

**What to build:** a minimal, synthetic reproduction of lizard mis-spanning TypeScript functions, and a decision on reporting it upstream.

ImpactGate takes each function's line span from lizard and trusts it, so a mis-span becomes a wrong CC in the report's "Top cost drivers" table. Ticket 04 found two cases on this repo with lizard 1.23.0:

- `packages/app/src/components/CommandDock.tsx`: `ResourcesTrigger` (lines 1285–1293, no branches) is spanned 1285–2785 at CC 92.
- `packages/app/src/space-authoring.ts` at PR #267's head: `deriveCompletedEdit` (943–1463) is ended at 1116, where the nested `const writeMap = (write: (map: Map) => Map): void => {` begins, and reported at CC 30.

No tracked issue covers this. lizard #331 "TSX Support" is closed, and ImpactGate's tracker has nothing on spans. This is also the first of the two conditions ticket 04 sets for reconsidering a gate.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] A synthetic repro that shares no code with this repo, as small as it will go, showing a wrong span under lizard 1.23.0. It should cover both shapes if they turn out to be separate causes: an interface derailing a later function, and a function-typed parameter annotation ending a span early. (Two separate causes, and neither is the interface; see the Answer.)
- [x] The repro is checked against lizard's latest release, and the result is recorded here. (1.24.0, identical.)
- [ ] Filing upstream on lizard, and optionally a companion issue on ImpactGate about trusting spans unchecked, is decided by a human before anything is posted. Filing is outward-facing.

## Answer

Two independent defects in lizard's TypeScript reader, found 2026-09-23 by Claude in a session with Toby Hede. Each repro below was run under `uvx --from lizard==1.23.0 lizard` and again under 1.24.0, the latest release on that date, with identical output. The mechanism is read from `lizard_languages/typescript.py` and `tsx.py` in the 1.23.0 wheel.

### Bug 1 (`.tsx` only): a type argument opening with `{` is read as JSX

```tsx
const n = f<{ a: 1 }>();

function small() {
  return 1;
}

function big(x: number) {
  if (x) { return 1; }
  return 2;
}
```

As `.tsx`, lizard reports no functions at all. As `.ts`, it reports `small@3-5` and `big@7-10`. `TSXTokenizer.process_token` hands every `<` to `XMLTagWithAttrTokenizer` as a possible JSX tag. What goes wrong after it aborts on `{` was not traced; the trigger was narrowed by experiment:

- Derails: `f<{ a: 1 }>()` and `f< { a: 1 }>()`.
- Harmless: `f<string>()`, `f<Ref | null>()`, `f<null | { a: 1 }>()`, `f<Readonly<{ a: 1 }>>()`, `ComponentProps<'div'>`, `f<[number, string]>()`, `f<-1>()`.
- `new Set<() => void>()` and `useRef<(c: boolean) => void>(…)` add phantom one-line functions but leave later spans intact.

The `ResourcesTrigger` case is this bug. The trigger is `CommandDock.tsx:693`, `createContext<{ current: boolean } | null>(null)`, not the `DockChrome` interface at line 236 that this ticket first named. That bisection took the file from line 237 onward, which starts inside the interface body; lizard then finds one function in the whole remainder, so it did not show a correct span. Replacing line 693 alone with a named type spans `ResourcesTrigger` 1286–1294 at CC 1.

**Fixed on our side** in the same change as this Answer: all eleven tracked `.tsx` sites (`App.tsx` three, `CommandDock.tsx` two, `PersistenceControl.tsx`, `SpaceAppFailure.tsx`, `SpaceCanvas.tsx`, `packages/ui/src/icons.tsx`, and two tests) now name the type instead. Functions lizard 1.23.0 finds, before → after: `App.tsx` 67 → 80, `CommandDock.tsx` 28 → 51, `node-internals.test.tsx` 0 → 15, `SpaceCanvas.tsx` 80 → 83, `SpaceApp.test.tsx` 97 → 99. Nothing holds it: the next inline object type argument in a `.tsx` file reintroduces it.

### Bug 2 (`.ts` and `.tsx`): the first `)` inside a parameter list ends it

```ts
function first(cb: (t: string) => string) {
  if (cb) { cb('a'); }
  return 1;
}

function probe(x: number) {
  if (x) { return 1; }
  if (x > 1) { return 2; }
  return 3;
}
```

lizard reports `first@1-1` at CC 1, and the `if` in its body is counted nowhere. `TypeScriptStates._dec` reads parameters and moves to expecting the body at the first `)`. It tracks `<>` depth, and only to avoid counting commas; it never tracks parenthesis depth. Every shape that nests a `)` in a parameter list does it:

- `cb: (t: string) => string` and `cb: { f(): void }`: the function ends at CC 1.
- `x: Array<(a: number) => void>`: the same, because the `<>` depth does not stop the `)`.
- `x = g()` and `x: (string)`: the function disappears from the output.
- Nested: `const inner = (write: (m: number) => number): void => {…}` inside `outer` ends `outer` at that line, which is the `deriveCompletedEdit` case.

Harmless: the same callable type as an interface member, or behind a name (`type Write = (m: number) => number`, `interface Props { cb: … }` with `({ cb }: Props)`). Method-signature syntax, extra parentheses round the type, and turning the nested arrow into a nested `function` all still break.

Reach on this repo, by a TypeScript-compiler-API scan for functions whose own parameter list contains a function type, method signature or call signature: 120 functions in 83 tracked files, 34 in `packages/app` source and 20 in root `src/`. The largest are `spaceRepositoryContract` (1,370 lines), `spaceResources` (635), `runSpaceResourceCoordination` (448), `Dock` (378), `createBrowserLocation` (325) and `createNavigation` (293); of the four checked by hand (`spaceRepositoryContract`, `spaceResources`, `createNavigation`, `createBrowserLocation`), lizard 1.23.0 spans each as one to four lines at CC 1. The count misses enclosing functions truncated by a nested site, as in `deriveCompletedEdit`. Not fixed on our side: it would mean moving inline callable types out of every parameter list, which is ordinary TypeScript bent round a warn-only report.

### Upstream

Both are small, self-contained reports for lizard's tracker: bug 2 wants a parenthesis-depth counter in `_dec`, and bug 1 wants the TSX tag reader to fail safe on `<{`. Filing is outward-facing and left to a human.
