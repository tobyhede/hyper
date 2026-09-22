# 15: Type size is off the scale in hand-rolled CSS

**What to build:** Every `font-size` in a hand-rolled stylesheet under `packages/*/src` states a step from a named type scale, or is a recorded exception with its reason, and the structural scan's CSS arm fails a new bare one.

Type size is on the chrome's structural scale — `--text-chrome-2xs`/`-xs`/`-sm` in `tailwind.css`'s `@theme inline` — and the scan's class arm already fails a length-like `text-[…]`. Its CSS arm does not read `font-size` at all: ticket 08 named radius, border width, box-shadow and font weight, and type size was left out. A review of PR #266 found the gap; ticket 08's resolution records it among what the scan cannot see.

**The check is written.** The patch under **The check** at the end of this ticket adds `font-size` (and the `font` shorthand's size, a `var()` fallback included, read up to any `/` line height at parenthesis depth zero) to `test/unit/structural-css-literals.test.ts`. A value passes only as a CSS-wide keyword, a fully tokenised `var()`, or a `calc()` over tokenised `var()`s. Its fixtures failed on the code before it and pass with it. It is not applied because, on the tree as it stood, the real-tree test reports seventeen declarations, and none can move onto an existing step without changing what is drawn:

**Chrome — nearest step, a small visual change each**

- `packages/app/src/components/resources-popover.css:67` `13px` — `sm` is `0.85rem`. Ticket 01 already merged `13px` into `0.85rem`.
- `packages/app/src/components/resources-popover.css:153` `11px`, the count badge — between `2xs` (`10px`) and `xs` (`0.75rem`).
- `packages/app/src/styles.css:414` `0.8rem`, `.canvas-refusal` — `xs` is `0.75rem`; ticket 01 moved `Command.tsx`'s `0.8rem` there.

`12px` equals `0.75rem` only while the root font size is 16px, and nothing in the app sets it, so no swap here is a guaranteed no-op.

**Resource surfaces — the Resource's own scale, which has no type steps for these**

- `packages/ui/src/canvas-resource.css:332` `12px`, `:457` `0.72rem`
- `packages/ui/src/markdown-resource-body.css:59` `15px`, `:195` `10px`, `:230` `9px`
- `packages/ui/src/resource-search-combobox.css:62` `15px`

The Resource's scale states `--canvas-resource-title-size` and two ratios off it; none of these values is on it.

**Relative units — candidate recorded exceptions**

- `packages/app/src/styles.css:466` `3.4cqw`, `:472` `5cqw`, `:482` `4.2cqw` — the presenting frame's type, sized to its container on purpose.
- `packages/app/src/styles.css:492` `0.9em`; `packages/ui/src/markdown-resource-body.css:73` `1.2em`, `:109` `0.9em` — code and headings sized relative to the body.
- `packages/app/src/styles.css:424` `0.95rem`, `:440` `1.3rem` — `.resource__title`.

Line numbers are as of the commit that filed this ticket; re-run the scan rather than trusting them.

**Decisions this ticket takes**

1. The three chrome sites: move each to its nearest step and record the delta, or add a step.
2. Whether the Resource gets a type-size scale beside its geometry (ticket 06), and its steps.
3. Whether container-relative (`cqw`) and body-relative (`em`) sizing are carve-outs, each with a reason.

These are decisions about what the product looks like, so they want an eye on them rather than a substitution.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] Every `font-size` under `packages/*/src/**/*.css` states a named step or is a recorded carve-out with a reason
- [ ] The patch under **The check** is applied (or its equivalent), and the real-tree test passes
- [ ] Ticket 08's "cannot see" list no longer names `font-size`
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## The check

Written against `test/unit/structural-css-literals.test.ts` as it stood when this ticket was filed; apply with `git apply` from the repository root, or re-derive it if the file has moved on.

````diff
--- a/test/unit/structural-css-literals.test.ts
+++ b/test/unit/structural-css-literals.test.ts
@@ -46,6 +46,7 @@ const BORDER_PROPERTY =
   /^border(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?(?:-width)?$/u;
 const SHADOW_PROPERTY = /^box-shadow$/u;
 const FONT_WEIGHT_PROPERTY = /^font-weight$/u;
+const FONT_SIZE_PROPERTY = /^font-size$/u;
 const FONT_SHORTHAND_PROPERTY = /^font$/u;
 
 const isStructuralCssProperty = (property: string): boolean =>
@@ -53,6 +54,7 @@ const isStructuralCssProperty = (property: string): boolean =>
   BORDER_PROPERTY.test(property) ||
   SHADOW_PROPERTY.test(property) ||
   FONT_WEIGHT_PROPERTY.test(property) ||
+  FONT_SIZE_PROPERTY.test(property) ||
   FONT_SHORTHAND_PROPERTY.test(property);
 
 /**
@@ -145,10 +147,63 @@ const bareBorderWidths = (property: string, value: string): readonly string[] =>
  */
 const FONT_WEIGHT_LITERAL = /^(?:[1-9]00|bold|bolder|lighter)$/iu;
 
+/**
+ * The `font` shorthand's size sits beside its weight: a component that is a
+ * length, a percentage or a size keyword — bare or as a var() fallback, once
+ * `beforeLineHeight` has cut any line height away — states one. A weight is
+ * unitless, so it never reads as a size.
+ */
+const FONT_SIZE_LITERAL =
+  /^(?:-?[\d.]+[a-z%]+|(?:xx?-|xxx-)?(?:small|large)|medium|smaller|larger)$/iu;
+
+/**
+ * A shorthand size joined to its line height, `var(--size, 13px)/1.5`, is one
+ * component; the size is what precedes the `/` at parenthesis depth zero, so a
+ * var() fallback is read whole rather than cut short by the line height.
+ */
+const beforeLineHeight = (component: string): string => {
+  let depth = 0;
+  for (let index = 0; index < component.length; index += 1) {
+    const char = component.charAt(index);
+    if (char === '(') depth += 1;
+    if (char === ')') depth -= 1;
+    if (char === '/' && depth === 0) return component.slice(0, index);
+  }
+  return component;
+};
+
+/** A CSS-wide keyword defers to the cascade; it states no magnitude of its own. */
+const CSS_WIDE_KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer)$/iu;
+
+/**
+ * A `calc()` states no literal of its own when every operand is a tokenised
+ * var() — `calc(var(--size) * var(--ratio))`. A number or length operand is a
+ * literal like any other.
+ */
+const isTokenizedCalc = (value: string): boolean => {
+  const trimmed = value.trim();
+  if (!trimmed.startsWith('calc(') || !trimmed.endsWith(')')) return false;
+  return topLevelComponents(trimmed.slice('calc('.length, -1)).every(
+    (component) => /^[-+*/]$/u.test(component) || isFullyTokenized(component),
+  );
+};
+
 const isBareCssLiteral = (property: string, value: string): boolean => {
   if (BORDER_PROPERTY.test(property)) return bareBorderWidths(property, value).length > 0;
   if (FONT_SHORTHAND_PROPERTY.test(property)) {
-    return topLevelComponents(value).some(statesLiteral(FONT_WEIGHT_LITERAL));
+    return topLevelComponents(value).some((component) => {
+      const size = beforeLineHeight(component);
+      return (
+        statesLiteral(FONT_WEIGHT_LITERAL)(component) || statesLiteral(FONT_SIZE_LITERAL)(size)
+      );
+    });
+  }
+  if (FONT_SIZE_PROPERTY.test(property)) {
+    return !(
+      CSS_WIDE_KEYWORD.test(value.trim()) ||
+      isFullyTokenized(value) ||
+      isTokenizedCalc(value)
+    );
   }
   // radius, box-shadow and font-weight never mix a literal magnitude with a
   // var()-based colour the way a border shorthand does, so the whole value
@@ -411,11 +466,67 @@ describe('arm 2 — bare structural literal in CSS (fixture proof)', () => {
     expect(found).toHaveLength(2);
   });
 
-  it('ignores a font shorthand that states no weight', () => {
+  it('ignores a font shorthand that states no literal weight or size', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        '.x { font: inherit; }\n.y { font: var(--text-chrome-sm)/1.5 sans-serif; }\n.z { font: var(--canvas-resource-title-weight) var(--text-chrome-sm)/1.5 sans-serif; }',
+      ),
+    );
+    expect(found).toEqual([]);
+  });
+
+  it('reports a bare font-size, including one written as a var() fallback', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font-size: 13px; }',
+          '.b { font-size: 0.85rem; }',
+          '.c { font-size: var(--x, 13px); }',
+          '.d { font-size: calc(var(--x) + 2px); }',
+        ].join('\n'),
+      ),
+    );
+    expect(found.map(({ line }) => line)).toEqual([1, 2, 3, 4]);
+  });
+
+  it('ignores a tokenised font-size, a calc() over tokens only, and a CSS-wide keyword', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font-size: var(--text-chrome-sm); }',
+          '.b { font-size: calc(var(--canvas-resource-title-size) * var(--canvas-resource-subtitle-ratio)); }',
+          '.c { font-size: inherit; }',
+          '.d { font-size: unset; }',
+        ].join('\n'),
+      ),
+    );
+    expect(found).toEqual([]);
+  });
+
+  it('reports a bare size written inside the font shorthand, bare or as a var() fallback, a line height after it included', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font: 13px/1.5 sans-serif; }',
+          '.b { font: var(--canvas-resource-title-weight) 13px sans-serif; }',
+          '.c { font: var(--canvas-resource-title-weight) var(--x, 13px) sans-serif; }',
+          '.d { font: var(--x, 13px)/1.5 sans-serif; }',
+          '.e { font: var(--x, bold) var(--text-chrome-sm)/1.5 sans-serif; }',
+        ].join('\n'),
+      ),
+    );
+    expect(found.map(({ line }) => line)).toEqual([1, 2, 3, 4, 5]);
+  });
+
+  it('ignores a font shorthand whose size is tokenised', () => {
     const found = findCssViolations(
       'fixture.css',
       maskCssComments(
-        '.x { font: inherit; }\n.y { font: 1rem/1.5 sans-serif; }\n.z { font: var(--canvas-resource-title-weight) 1rem/1.5 sans-serif; }',
+        '.a { font: var(--canvas-resource-title-weight) var(--text-chrome-sm)/1.5 sans-serif; }',
       ),
     );
     expect(found).toEqual([]);
````
