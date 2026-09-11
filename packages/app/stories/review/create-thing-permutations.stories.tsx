/**
 * THROWAWAY UX PROTOTYPE — what Create Thing costs in the Things cluster.
 *
 * **The complaint, stated as a count.** The Dock draws `[▢ Things ⌄][+]` and the
 * `+` is a disclosure: it opens a menu of the three kinds, so *every* creation
 * costs two presses. The kind an author reaches for constantly is the Markdown
 * Thing, and it is the one kind that needs no second decision — so the most
 * common command in the product pays for a choice it never makes.
 *
 * **The asymmetry the options are weighed against, because it is real and it is
 * in the code.** `App.tsx` spends the three kinds two different ways:
 *
 *   markdown  `addThing()`              — one activation completes an Edit
 *   alias     `thingCreation.open()`    — opens a modal pane (a Target is required)
 *   space     `thingCreation.open()`    — opens a modal pane (a Space is required)
 *
 * So the menu is not one command disclosed three ways. It is one command that
 * completes, sitting behind the same trigger as two commands that were always
 * going to open something. The menu adds a press to the one that needed none and
 * a *third* step to the two that already had two.
 *
 * **What the component's own doc says, so the options argue with it rather than
 * around it.** `CreateMenu` states: *"The kind is chosen at creation, so the menu
 * offers three peers rather than a split button with a hidden default."* That
 * sentence is what Option E contradicts, and contradicting it is the point of
 * drawing it — a default is only *hidden* if the glyph does not already name it,
 * and `icons.tsx` documents `PlusIcon` as **"Create a Markdown Thing"** today.
 * The history is real too: `AddThingControl` was a split button, deleted by
 * `.scratch/command-dock/issues/08` when the Dock replaced the Sidebar, and
 * `CLAUDE.md` says not to restore it because its recorded design contradicts
 * `CreateMenu`'s. This sheet is where that contradiction is settled by looking,
 * not by restoring anything.
 *
 * **Nothing here creates a Thing.** Every press is recorded in the log instead,
 * with the press count each option has spent, so the 2× is measured rather than
 * asserted. The strips are the real `Toolbar`, the real `ToolbarButton`, the real
 * `ThingsTrigger` and the real `command-dock.css`, so the options are judged on
 * the chrome they would ship on.
 */
import type { Story } from '@ladle/react';
import { useRef, useState, type ReactNode } from 'react';
import {
  Button,
  ChevronDownIcon,
  DiagramIcon,
  GraphIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  PlusIcon,
  PresentIcon,
  Separator,
  ThingKindIcon,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  buttonVariants,
  cn,
  thingKindName,
} from '@project/ui';
import { THINGS_TRIGGER } from '#components/command-dock-triggers';
// `CommandDock.tsx` imports `command-dock.css` itself, so the surface, cluster
// and cluster rules arrive with the trigger rather than being asked for twice.
import { ThingsTrigger } from '#components/CommandDock';
import './create-thing-peer-row.css';

export default { title: 'Review/Create Thing' };

/** The three kinds, in the order `CreateMenu` lists them today. */
const THING_KINDS = ['markdown', 'space', 'alias'] as const;

type ThingKind = (typeof THING_KINDS)[number];

/**
 * What one activation of one kind actually does, which is what the log reports.
 *
 * Read off `App.tsx`'s own `onCreate`, so the sheet cannot advertise a cost the
 * application does not pay.
 */
const KIND_OUTCOME = {
  markdown: 'Edit completed — the Thing is on the canvas',
  space: 'creation pane opened — a target Space is still owed',
  alias: 'creation pane opened — a Target is still owed',
} as const satisfies Record<ThingKind, string>;

/* ------------------------------------------------------------------ recorder */

interface Pressed {
  readonly id: number;
  readonly option: string;
  readonly line: string;
}

/**
 * The one recorder every option reports through, and the press counter beside it.
 *
 * A `useRef` counter rather than the log's own length, for the reason
 * `link-actions-prototype` gives: two entries added in one tick off a stale
 * length collide on their key.
 */
function usePressLog() {
  const [log, setLog] = useState<readonly Pressed[]>([]);
  const [presses, setPresses] = useState<Readonly<Record<string, number>>>({});
  const nextId = useRef(0);
  return {
    log,
    presses,
    reset: () => {
      setLog([]);
      setPresses({});
    },
    /** Every activation, disclosure included — that is what makes the count honest. */
    record: (option: string, line: string) => {
      nextId.current += 1;
      const entry = { id: nextId.current, option, line };
      setLog((current) => [entry, ...current].slice(0, 8));
      setPresses((current) => ({ ...current, [option]: (current[option] ?? 0) + 1 }));
    },
  };
}

/** What a reviewer reads in place of a created Thing. */
function PressLog({
  log,
  onReset,
}: {
  readonly log: readonly Pressed[];
  readonly onReset: () => void;
}) {
  return (
    <div className="w-full max-w-[38rem] rounded-md border bg-background/95 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-sans text-xs font-semibold text-muted-foreground">Presses</p>
        <Button variant="ghost" size="compact" onClick={onReset}>
          Reset
        </Button>
      </div>
      {log.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          Nothing yet — try creating a Markdown Thing in each strip and watch the counts.
        </p>
      ) : (
        <ul className="grid gap-1 font-mono text-[11px]">
          {log.map((entry) => (
            <li key={entry.id}>
              <span className="text-muted-foreground">{entry.option} · </span>
              {entry.line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- chrome */

function PrototypeBanner({ children }: { readonly children: string }) {
  return (
    <div className="bg-amber-400 px-3 py-1 text-center text-xs font-semibold text-amber-950">
      PROTOTYPE — {children} Nothing here creates a Thing.
    </div>
  );
}

/**
 * One option's real dock strip.
 *
 * The `Toolbar` root is the Dock's own — `command-dock__surface` carries the
 * translucency, the blur, the border and the 4px pad, and `data-orientation`
 * selects between the row and the 208px column. The cluster is drawn whole
 * rather than the `+` alone, because the question is what the *trailing* slot
 * costs next to `Things ⌄`, and a control judged out of its cluster is judged
 * against nothing.
 */
function DockStrip({
  vertical = false,
  clusterClassName,
  width,
  identities,
  children,
}: {
  readonly vertical?: boolean;
  /** An arrangement to try on the Things cluster, in place of the dock's grid. */
  readonly clusterClassName?: string;
  /** A column width to try, where the question is how much room an option needs. */
  readonly width?: number;
  /** Draw the three identity clusters above Things, as a ruler for the columns. */
  readonly identities?: boolean;
  readonly children: ReactNode;
}) {
  return (
    /* The dock shrink-wraps its commands in the application because
       `.command-dock` is an absolutely-positioned box around it. Nothing here is
       absolutely positioned, and a flex container at block level fills its line —
       so the wrapper supplies the shrink-wrap the slot would, and the strips are
       as wide as what they hold. */
    <div className="w-fit">
      <Toolbar
        aria-label="Command Dock"
        orientation={vertical ? 'vertical' : 'horizontal'}
        className="command-dock__surface nokey"
        data-orientation={vertical ? 'vertical' : 'horizontal'}
        // An override rather than a class, because the width being tried is the
        // question rather than a treatment: `command-dock.css` states 208px and
        // a story that wants to ask "how much room does this need" has to be
        // able to say a number the sheet does not already own.
        style={width === undefined ? undefined : { width }}
      >
        {identities === true ? <IdentityRuler /> : null}
        <ToolbarGroup aria-label="Things" className={cn('command-dock__cluster', clusterClassName)}>
          <ToolbarButton variant="ghost" {...THINGS_TRIGGER}>
            <ThingsTrigger />
          </ToolbarButton>
          {children}
        </ToolbarGroup>
      </Toolbar>
    </div>
  );
}

/** One option: what it is, what it costs, and the strip itself. */
function Option({
  name,
  presses,
  claim,
  cost,
  children,
}: {
  readonly name: string;
  readonly presses: number;
  /** What the option buys, in one line. */
  readonly claim: string;
  /** What it spends to buy it — the half prose keeps losing. */
  readonly cost: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-2 border-t pt-4">
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-semibold">{name}</h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {presses} press{presses === 1 ? '' : 'es'} spent
        </span>
      </div>
      <p className="max-w-[46rem] text-xs text-muted-foreground">
        <span className="text-foreground">Buys </span>
        {claim}
      </p>
      <p className="max-w-[46rem] text-xs text-muted-foreground">
        <span className="text-foreground">Costs </span>
        {cost}
      </p>
      <div className="pt-1">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------- permutations */

/**
 * **A — the menu, as shipped.** One trigger, three peers behind it.
 *
 * Drawn first and unchanged so every count below is read against it rather than
 * against a memory of it.
 */
function MenuCreate({ record }: { readonly record: (line: string) => void }) {
  return (
    // Opening is a press and is counted as one — that is the whole complaint,
    // and a sheet that counted only the second half of it would be arguing for
    // the arrangement it exists to question.
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) record('disclosed the three kinds — nothing created yet');
      }}
    >
      <DropdownMenuTrigger
        className="nokey cdp-set-verb"
        aria-label="Create Thing"
        title="Create Thing"
        render={<ToolbarButton variant="ghost" size="icon" />}
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" sideOffset={6} className="nokey w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create Thing</DropdownMenuLabel>
          {THING_KINDS.map((kind) => (
            <DropdownMenuItem
              key={kind}
              className="gap-2"
              onClick={() => record(`${thingKindName(kind)} — ${KIND_OUTCOME[kind]}`)}
            >
              <ThingKindIcon kind={kind} />
              {thingKindName(kind)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * **B — three peers, bare.** Each kind its own control, no disclosure anywhere.
 *
 * The cheapest possible arithmetic and the weakest possible label: a kind glyph
 * on its own says *what a Thing is*, not *make one*. The same three glyphs
 * already appear in the Things list as row markers and on the canvas as the
 * Thing's own kind, so three of them in a command slot are the first place in
 * the product where that mark means a verb.
 */
function PeerCreate({ record }: { readonly record: (line: string) => void }) {
  return (
    // A nested `ToolbarGroup`, which is the composition rather than a new
    // component: Base UI's group is a plain `role="group"` div with no
    // positional logic, so it nests inside the Things cluster and leaves the
    // roving tabindex on the one `Toolbar` root. `command-dock.css` then has one
    // element to place instead of three, which is what lets the vertical column
    // give the peers a row of their own (`create-thing-peer-row.css`).
    //
    // **What it does not fix, and cannot through the primitive.** The vertical
    // dock is `orientation="vertical"`, and Base UI's composite reads only
    // ArrowUp/ArrowDown at that orientation — `Toolbar.Root` takes
    // `'horizontal' | 'vertical'` and does not expose the composite's own
    // `'both'`. So these three are drawn left to right and reached with
    // ArrowDown. The traversal *order* still matches reading order; the key
    // disagrees with the axis of this one segment.
    <ToolbarGroup aria-label="Create a Thing" className="cdp-peer-row">
      {THING_KINDS.map((kind) => (
        <ToolbarButton
          key={kind}
          variant="ghost"
          size="icon"
          className="nokey"
          aria-label={`Create ${thingKindName(kind)}`}
          title={`Create ${thingKindName(kind)}`}
          onClick={() => record(`${thingKindName(kind)} — ${KIND_OUTCOME[kind]}`)}
        >
          <ThingKindIcon kind={kind} />
        </ToolbarButton>
      ))}
    </ToolbarGroup>
  );
}

/**
 * **C — the peers, grouped behind one `+`.** A non-interactive `+` labels the
 * group; the three glyphs after it are the commands.
 *
 * This is the "grouped with a `+` action" reading, and the `+` is a `label`
 * variant rather than a fourth button on purpose: `Button`'s `label` variant
 * exists for exactly this — the shared box and type without button semantics or
 * hover feedback — so the mark qualifies the group without adding a target that
 * does nothing.
 *
 * It answers B's objection at one control's width: the glyphs keep meaning
 * "kind" and the `+` in front of them supplies the verb once.
 */
function GroupedPeerCreate({ record }: { readonly record: (line: string) => void }) {
  return (
    <span className="cdp-set-verb ml-1 inline-flex items-center gap-px rounded-[7px] border border-border/70 bg-secondary/40 p-px">
      {/* A span through `buttonVariants`, which is what the `label` variant is
          documented for: the shared box and type with no button semantics and no
          hover feedback. A real `<button>` here would be a target that does
          nothing, and `aria-hidden` on a focusable element is worse than the
          target. */}
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: 'label', size: 'icon' }), 'size-6')}
      >
        <PlusIcon />
      </span>
      {THING_KINDS.map((kind) => (
        <ToolbarButton
          key={kind}
          variant="ghost"
          size="icon"
          className="nokey size-6"
          aria-label={`Create ${thingKindName(kind)}`}
          title={`Create ${thingKindName(kind)}`}
          onClick={() => record(`${thingKindName(kind)} — ${KIND_OUTCOME[kind]}`)}
        >
          <ThingKindIcon kind={kind} />
        </ToolbarButton>
      ))}
    </span>
  );
}

/**
 * A `+` badge on a kind glyph, which is the "decorate the icons" question drawn.
 *
 * The hole is **cut** rather than painted, for the reason `AliasIcon` gives: the
 * Dock's surface is translucent and blurred, so a disc filled with a background
 * colour composites against whatever canvas is behind the bar. A mask removes
 * the region from the base instead.
 *
 * `corner` exists because the answer differs by kind and that is the finding:
 * an Alias **already** carries a badge at bottom-right, so a `+` there is two
 * badges on one 14px mark, and moving the `+` to top-right for that one kind
 * makes the three commands disagree about where their own verb lives.
 */
function PlusBadgedGlyph({
  kind,
  corner = 'bottom-right',
  size = 14,
}: {
  readonly kind: ThingKind;
  readonly corner?: 'bottom-right' | 'top-right';
  readonly size?: number;
}) {
  // The badge's geometry in the glyph's own 24-unit box, so it reads against
  // `AliasIcon`'s numbers rather than against a second set: centre 17.5 in from
  // the leading edge, radius 7.75, and the same 3-unit stroke, because at 14px
  // it is the mark that has to survive and a filled shape survives where a line
  // weight does not.
  const centre = 17.5;
  const cy = corner === 'bottom-right' ? centre : 24 - centre;
  const unit = size / 24;
  return (
    <span
      className="relative inline-flex flex-none items-center text-[var(--muted-foreground)]"
      role="img"
      aria-label={`Create ${thingKindName(kind)}`}
      style={{ width: size, height: size }}
    >
      {/* **The hole is cut, not painted**, which is the rule `AliasIcon` states
          and the one this prototype has to honour to be worth looking at: the
          Dock's surface is `--card` at 92% behind an 8px blur, so a disc filled
          with a background colour composites against whatever canvas is behind
          the bar and the badge reads one way over pale paper and another over a
          Thing. `AliasIcon` cuts it with an SVG mask because it owns its own
          `svg`; this one is composed over the shipped `ThingKindIcon`, so it
          cuts the same hole from outside with a CSS mask. Same hole, and no new
          export owed by `@project/ui` for a sheet that may be thrown away. */}
      <span
        className="absolute inset-0 inline-flex"
        style={{
          maskImage: `radial-gradient(circle ${unit * 7.75}px at ${unit * centre}px ${unit * cy}px, transparent 99%, #000 100%)`,
        }}
      >
        <ThingKindIcon kind={kind} size={size} />
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={`M${centre} ${cy - 4.6}v9.2M${centre - 4.6} ${cy}h9.2`}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * **D — three peers, each glyph decorated with a `+`.** B's arithmetic with the
 * verb carried by the mark instead of by a neighbour.
 *
 * Drawn at the Dock's own 14px, which is where it has to survive. See
 * `PlusBadges` below for the same mark at three sizes and in both corners.
 */
function BadgedPeerCreate({ record }: { readonly record: (line: string) => void }) {
  return (
    // The same nested group B takes, so the two options differ by the badge and
    // by nothing else. Fixing the row on one and not the other would have made
    // D look 29px worse in the vertical dock for a reason that is not D's.
    <ToolbarGroup aria-label="Create a Thing" className="cdp-peer-row">
      {THING_KINDS.map((kind) => (
        <ToolbarButton
          key={kind}
          variant="ghost"
          size="icon"
          className="nokey"
          aria-label={`Create ${thingKindName(kind)}`}
          title={`Create ${thingKindName(kind)}`}
          onClick={() => record(`${thingKindName(kind)} — ${KIND_OUTCOME[kind]}`)}
        >
          <PlusBadgedGlyph kind={kind} />
        </ToolbarButton>
      ))}
    </ToolbarGroup>
  );
}

/**
 * **E — the split.** `+` completes a Markdown Thing; the chevron beside it
 * discloses the two kinds that open a pane.
 *
 * The one option whose shape is the code's own asymmetry: the control that
 * completes an Edit is the button, and the two that were always going to open
 * something are behind the disclosure. One press for the common case, two for
 * the two that already cost more than two.
 *
 * **It contradicts `CreateMenu`'s stated design and that is deliberate.** The
 * objection is a "hidden default"; the answer is that the default is not hidden
 * if the glyph already names it, and `icons.tsx` has documented `PlusIcon` as
 * *"Create a Markdown Thing"* since before this menu existed. What it genuinely
 * costs is a second target in the cluster — the Things trigger's chevron, this
 * chevron, and an author who has to tell the two apart.
 */
function SplitCreate({ record }: { readonly record: (line: string) => void }) {
  return (
    <span className="cdp-set-verb inline-flex items-center">
      <ToolbarButton
        variant="ghost"
        size="icon"
        className="nokey w-6 rounded-r-none"
        aria-label={`Create ${thingKindName('markdown')}`}
        title={`Create ${thingKindName('markdown')}`}
        onClick={() => record(`${thingKindName('markdown')} — ${KIND_OUTCOME.markdown}`)}
      >
        <PlusIcon />
      </ToolbarButton>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) record('disclosed the two kinds that open a pane — nothing created yet');
        }}
      >
        <DropdownMenuTrigger
          className="nokey w-5 rounded-l-none px-0"
          aria-label="Create another kind of Thing"
          title="Create another kind of Thing"
          render={<ToolbarButton variant="ghost" size="icon" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" sideOffset={6} className="nokey w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create Thing</DropdownMenuLabel>
            {THING_KINDS.filter((kind) => kind !== 'markdown').map((kind) => (
              <DropdownMenuItem
                key={kind}
                className="gap-2"
                onClick={() => record(`${thingKindName(kind)} — ${KIND_OUTCOME[kind]}`)}
              >
                <ThingKindIcon kind={kind} />
                {thingKindName(kind)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/* ------------------------------------------------------------------ stories */

/**
 * The five options, each in a real horizontal dock strip, with what each has
 * spent.
 *
 * Create a Markdown Thing once in every strip and read the counts: A costs two,
 * B, C, D and E cost one. Then create an Alias in every strip: A and E cost two,
 * B, C and D cost one — and all five then hand the author a modal pane, which is
 * the step none of them removes.
 */
export const Permutations: Story = () => {
  const { log, presses, record, reset } = usePressLog();
  const press = (option: string) => (line: string) => record(option, line);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        Five ways the Things cluster can offer Create. Every press is counted, disclosures included.
      </PrototypeBanner>
      <div className="grid flex-1 gap-4 p-6">
        <Option
          name="A · Menu (shipped today)"
          presses={presses['A'] ?? 0}
          claim="one trailing target, and three kinds that read as peers with no default between them."
          cost="two presses for every creation, including the one kind that needs no second decision."
        >
          <DockStrip>
            <MenuCreate record={press('A')} />
          </DockStrip>
        </Option>

        <Option
          name="B · Three peers, bare"
          presses={presses['B'] ?? 0}
          claim="one press for all three kinds, and no hidden default to argue about."
          cost="three targets in the cluster, a kind glyph asked to mean a verb for the first time in the product, and — in the vertical dock — a row the arrow keys walk downward. See VerticalDock."
        >
          <DockStrip>
            <PeerCreate record={press('B')} />
          </DockStrip>
        </Option>

        <Option
          name="C · Peers grouped behind one +"
          presses={presses['C'] ?? 0}
          claim="B's arithmetic with the verb stated once, so the glyphs keep meaning kind."
          cost="a bracketed sub-group inside a cluster that already reads as one, and the widest resting footprint here."
        >
          <DockStrip>
            <GroupedPeerCreate record={press('C')} />
          </DockStrip>
        </Option>

        <Option
          name="D · Peers with + decorated onto each glyph"
          presses={presses['D'] ?? 0}
          claim="B's arithmetic and C's verb at B's width — the mark carries both facts."
          cost="the badge lands where the Alias already has one, so Create Alias and Create Markdown Thing draw the same mark. See PlusBadges."
        >
          <DockStrip>
            <BadgedPeerCreate record={press('D')} />
          </DockStrip>
        </Option>

        <Option
          name="E · Split: + completes, chevron discloses the rest"
          presses={presses['E'] ?? 0}
          claim="one press for the kind that completes an Edit, and the menu kept for the two that open a pane."
          cost="a second chevron beside the Things trigger's own, and a default the shipped design argues against."
        >
          <DockStrip>
            <SplitCreate record={press('E')} />
          </DockStrip>
        </Option>

        <div className="border-t pt-4">
          <PressLog log={log} onReset={reset} />
        </div>
      </div>
    </div>
  );
};
Permutations.meta = { iframed: true };

/**
 * The same five in the 208px vertical dock, which is where width is actually
 * spent.
 *
 * **The column is a three-track grid** — `minmax(0, 1fr) 28px 28px` — and
 * `command-dock.css` states why: the name takes the slack, the disclosure always
 * lands in track 2 and a row's own verb in track 3, so a reader who learns where
 * the chevrons are at one cluster finds them at the next. Things is already the
 * one cluster with a control on both sides of its name, which is what the fourth
 * track costs.
 *
 * Every option here is placed in that third track, so what the strips show is
 * what each one does to the column a Diagram and a Graph also live in. Measured
 * off the rendered strips rather than reasoned about:
 *
 *   A  44px tall, nothing past the edge          — fits
 *   B  73px tall, peers on one trailing row      — fits, one 28px row taller than its neighbours
 *   C  44px tall, but 40px of it is outside      — three of its four commands are clipped
 *   D  73px tall, as B                           — same row, and still the badge collision
 *   E  44px tall, nothing past the edge          — fits
 *
 * **B and D reach 73px rather than 102px because the peers are one grid item.**
 * Left as three siblings they auto-place onto three rows and the Things block
 * stands at 102px beside a 44px Diagram and a 44px Graph, which is the Dock
 * losing the alignment its grid is spent on. Wrapped in a nested `ToolbarGroup`
 * the column has one child to place, `create-thing-peer-row.css` gives it
 * `grid-column: 1 / span 3`, and the three sit in one 28px row under the
 * trigger. No new component: Base UI's group is a plain `role="group"` div with
 * no positional logic, so the roving tabindex stays on the one `Toolbar` root.
 *
 * **What that row costs, measured rather than assumed.** The vertical dock is
 * `orientation="vertical"`, and Base UI's composite reads only ArrowUp and
 * ArrowDown there — `Toolbar.Root` takes `'horizontal' | 'vertical'` and does
 * not expose the composite's own `'both'`. Driven from the keyboard in this
 * story: ArrowRight on the Things trigger does nothing, and ArrowDown three
 * times walks Markdown, Space, Alias in the order they are drawn. So the
 * traversal order matches reading order and only the key disagrees with the
 * axis of this one segment. Nothing in the primitive changes that, and adding
 * ArrowLeft/ArrowRight by hand would be a hand-rolled deviation over a
 * composite that already owns the key handling.
 *
 * **C is worse than it looks**: its bracketed group is one grid item too, but it
 * is handed the 28px track (24px after its own padding) and its four children
 * run to 248px against a 208px surface. The box reports no overflow because the
 * *group* fits; what leaves the dock is the commands inside it. It would need
 * the same `1 / span 3` rule, at which point its bracket is a bordered block
 * spanning the column.
 *
 * An option that wins on the row and loses here has not won — the vertical dock
 * is one of the twelve slots, not a variant.
 */
export const VerticalDock: Story = () => {
  const { log, presses, record, reset } = usePressLog();
  const press = (option: string) => (line: string) => record(option, line);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        The 208px column, where the three-track grid decides. Track 3 is 28px wide.
      </PrototypeBanner>
      <div className="flex flex-1 flex-wrap items-start gap-6 p-6">
        {(
          [
            ['A', <MenuCreate key="a" record={press('A')} />],
            ['B', <PeerCreate key="b" record={press('B')} />],
            ['C', <GroupedPeerCreate key="c" record={press('C')} />],
            ['D', <BadgedPeerCreate key="d" record={press('D')} />],
            ['E', <SplitCreate key="e" record={press('E')} />],
          ] as const
        ).map(([option, control]) => (
          <div key={option} className="grid gap-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              {option} · {presses[option] ?? 0} presses
            </p>
            <DockStrip vertical>{control}</DockStrip>
          </div>
        ))}
      </div>
      <div className="p-6 pt-0">
        <PressLog log={log} onReset={reset} />
      </div>
    </div>
  );
};
VerticalDock.meta = { iframed: true };

/**
 * A ruler, not evidence: the three identity clusters drawn only so the chevron
 * column is visible.
 *
 * `IdentityName` is internal to `CommandDock.tsx`, so these are a facsimile —
 * the real classes (`command-dock__name`, `__disclose`, `__verb`) over stand-in
 * words, which is enough to put a chevron in track 2 and a verb in track 3 and
 * nothing like enough to say anything about renaming, withdrawal or focus. It
 * is here to be measured against, and no claim about these three rows should be
 * read off it.
 */
function IdentityRuler({ vertical = true }: { readonly vertical?: boolean }) {
  /* The rule the production Dock already keeps: a `Divider` sits between each
     of the four clusters, horizontal on a vertical dock and vertical on a
     horizontal one (`CommandDock.tsx`, `Dock`). The ruler was drawing the four
     clusters bare, which made the Things row look joined to the Graph above it
     in a way the real Dock never does — so the separator here is a faithfulness
     fix rather than a proposal. `my-1` is `Divider`'s own horizontal spacing. */
  const rows = [
    { label: 'Meta Space', icon: <ThingKindIcon kind="space" />, verb: null },
    { label: 'Overview', icon: <DiagramIcon />, verb: null },
    {
      label: 'Release path',
      icon: <GraphIcon color="#6ea8fe" />,
      verb: <PresentIcon color="currentColor" filled />,
    },
  ];
  return (
    <>
      {rows.map((row) => (
        <ToolbarGroup
          key={row.label}
          aria-label={row.label}
          className="command-dock__cluster"
          data-vertical={vertical}
        >
          <ToolbarButton variant="ghost" size="compact" className="command-dock__name">
            {row.icon}
            <span className="truncate">{row.label}</span>
          </ToolbarButton>
          <ToolbarButton
            variant="ghost"
            size="icon"
            className="command-dock__disclose"
            aria-label={`${row.label} menu`}
          >
            <ChevronDownIcon />
          </ToolbarButton>
          {row.verb === null ? null : (
            <ToolbarButton
              variant="ghost"
              size="icon"
              className="command-dock__verb"
              aria-label="Present"
            >
              {row.verb}
            </ToolbarButton>
          )}
        </ToolbarGroup>
      ))}
      <Separator
        orientation={vertical ? 'horizontal' : 'vertical'}
        align="center"
        className="my-1"
      />
    </>
  );
}

/**
 * B on one line, which is what "Things" being a fixed word buys.
 *
 * **The observation this rests on is the Dock's own.** `command-dock.css` gives
 * every cluster `minmax(0, 1fr) 28px 28px` and says why: the name takes the
 * slack and truncates, so the column does not resize when the reader crosses
 * from `Meta Space` to `Design system`. That reasoning is about **titles** —
 * Space, Diagram and Graph each name an entity the author renamed, and the
 * length is theirs. Things names a set, has no name to edit (which is why the
 * word lives inside its trigger rather than beside it), and is the literal
 * string "Things" in every Space that will ever exist. The 1fr track is 140px
 * held open for something that never grows.
 *
 * So this cluster packs instead: the word, then the three peers, all on one row.
 * The rows below try it at 208px — the width the vertical dock is today — and at
 * two widths above it, so the fit is answered as a number rather than as a yes
 * or no.
 *
 * **It fits, with room.** At 208px: the peers are 86px, the trigger takes the
 * rest, 12px of slack sits between the word and the first peer and nothing goes
 * past the edge. The cluster returns to 44px — the same height as Diagram and
 * Graph — and the whole dock goes from 190px to 161px. No widening is needed, so
 * the 224px and 240px rows are there to show the slack growing rather than to
 * offer a way out.
 *
 * **The chevron is pinned into the peers' rhythm rather than left beside the
 * word.** The trigger takes the row's slack, so its trailing edge sits one gap
 * before the first peer and the chevron — which `command-dock.css` already
 * pushes to that edge — lands on the peers' own 29px pitch. Measured across the
 * four glyphs: **29, 29, 29**. No padding change was owed; sweeping the
 * trigger's `padding-inline-end` gives chevron-to-first-peer pitches of
 * 28/29/30/31px at 5/6/7/8px, and 6px is what the sheet already sets.
 *
 * **What it spends is the chevron column, and measuring it half dissolves the
 * objection.** The three identities put their chevron at x=146, one x for every
 * row. Packed Things puts its own at x=101. But the grid arrangement does not
 * put it at 146 either — it lands at **x=153**, because the Things trigger spans
 * tracks 1–2 and pushes its chevron to the end of that span, while a standalone
 * disclosure centres a 14px glyph in a 28px track. So the column already has a
 * 7px seam exactly at Things, and "the chevrons line up for all four rows" was
 * never quite true. The counter-argument is that this chevron is the odd one
 * anyway — it is *inside* its trigger rather than a button beside it, the one
 * trigger built that way — so it was never really in that column to begin with.
 *
 * **And the track it gives up is mostly empty.** In the grid arrangement the run
 * from the Thing glyph to the chevron is **122px**, against 53px packed — the
 * 1fr track doing for a fixed ~45px string what it exists to do for `Meta Space`
 * and `Design system`. Roughly 69px of that run is empty, and it is the clearest
 * argument that this cluster was never the one the slack track was written for.
 *
 * The right edge is unaffected either way: the last peer ends at x=203, exactly
 * where Present ends, so the surface keeps its trailing edge in both.
 *
 * What packing does **not** fix is the arrow key: the peers are still walked
 * with ArrowDown, because the toolbar is vertical and `Toolbar.Root` has no
 * `'both'`. That cost is the same in both arrangements, so it does not separate
 * them.
 */
export const SingleLine: Story = () => {
  const { log, record, reset } = usePressLog();
  const press = (option: string) => (line: string) => record(option, line);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeBanner>
        B packed onto one row, because "Things" is a fixed word and needs no slack track.
      </PrototypeBanner>
      <div className="grid flex-1 content-start gap-6 p-6">
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Packed onto one row, at three column widths</h3>
          <div className="flex flex-wrap items-start gap-6">
            {[208, 224, 240].map((width) => (
              <div key={width} className="grid gap-2">
                <p className="font-mono text-[11px] text-muted-foreground">{width}px</p>
                <DockStrip vertical width={width} clusterClassName="cdp-single-line">
                  <PeerCreate record={press(`single-${String(width)}`)} />
                </DockStrip>
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-3 border-t pt-4">
          <h3 className="text-sm font-semibold">
            The two rows it replaces, at 208px — for comparison
          </h3>
          <DockStrip vertical>
            <PeerCreate record={press('two-row')} />
          </DockStrip>
        </section>
        <section className="grid gap-3 border-t pt-4">
          <h3 className="text-sm font-semibold">
            Beside the clusters it has to line up with — the whole decision
          </h3>
          <p className="max-w-[46rem] text-xs text-muted-foreground">
            Read down the chevrons. The three identities sit at x=146 in both. Things sits at x=153
            on the left and x=101 on the right — so the left is already 7px out of the column, and
            the right trades that column for the peers&rsquo; own 29px pitch. Note the run from the
            Thing glyph to the chevron on the left: 122px against 53px packed, most of it a track
            held open for a word that never changes. Both strips carry the Dock&rsquo;s own divider
            above the Things row. The three rows above Things are a ruler, not a claim.
          </p>
          <div className="flex flex-wrap items-start gap-8">
            <div className="grid gap-2">
              <p className="font-mono text-[11px] text-muted-foreground">grid · two rows · 73px</p>
              <DockStrip vertical identities>
                <PeerCreate record={press('ruler-grid')} />
              </DockStrip>
            </div>
            <div className="grid gap-2">
              <p className="font-mono text-[11px] text-muted-foreground">packed · one row · 44px</p>
              <DockStrip vertical identities clusterClassName="cdp-single-line">
                <PeerCreate record={press('ruler-packed')} />
              </DockStrip>
            </div>
          </div>
        </section>
        <div className="border-t pt-4">
          <PressLog log={log} onReset={reset} />
        </div>
      </div>
    </div>
  );
};
SingleLine.meta = { iframed: true };

/**
 * The decorate-the-glyph question on its own, at the three sizes and in both
 * corners.
 *
 * **The Dock draws at 14px, so 14px is the row that decides.** The other two are
 * there to show what is being lost rather than to offer a way out — no option
 * gets to specify 28px glyphs in a 28px button.
 *
 * **Bottom-right is fatal, and for a reason worse than crowding.** The badge is
 * a 7.75-unit hole in a 24-unit box, and bottom-right is where `StickyNote`
 * keeps its fold — the one feature separating it from a plain rectangle — so a
 * Markdown Thing badged there is a page with a plus on it. Worse, it is also
 * where an Alias keeps its own arrow, so the `+` does not crowd that badge, it
 * **replaces** it: compare the first and third groups in that row and they are
 * the same mark. Create Markdown Thing and Create Alias would be two commands
 * drawing one glyph.
 *
 * **Top-right survives, at a price the Alias pays alone.** The fold and the
 * Alias arrow both live, so the three kinds stay apart — but the Alias is then
 * carrying two badges on one 14px mark, and at 14px (the chipped glyph at the
 * left of each group, which is the size the Dock draws) it reads as ink rather
 * than as two facts. The other two kinds are fine there.
 *
 * The last row draws the plain glyphs, which is what any of this is measured
 * against.
 */
export const PlusBadges: Story = () => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <PrototypeBanner>
      A + badge on each kind glyph, at the size the Dock actually draws and two above it.
    </PrototypeBanner>
    <div className="grid gap-6 p-6">
      {(['bottom-right', 'top-right'] as const).map((corner) => (
        <section key={corner} className="grid gap-3 border-t pt-4">
          <h3 className="text-sm font-semibold">
            Badge at {corner}
            {corner === 'bottom-right'
              ? ' — replaces the Alias badge, and eats the Markdown fold'
              : ' — both silhouettes survive; the Alias carries two badges'}
          </h3>
          <div className="flex flex-wrap items-end gap-8">
            {THING_KINDS.map((kind) => (
              <div key={kind} className="grid justify-items-center gap-2">
                <div className="flex items-end gap-4">
                  {[14, 20, 28].map((size) => (
                    <span
                      key={size}
                      className={cn(
                        'inline-flex items-center justify-center rounded-[6px] p-1',
                        size === 14 && 'bg-secondary/60 ring-1 ring-border',
                      )}
                    >
                      <PlusBadgedGlyph kind={kind} corner={corner} size={size} />
                    </span>
                  ))}
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{thingKindName(kind)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="grid gap-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Undecorated, for comparison</h3>
        <div className="flex flex-wrap items-end gap-8">
          {THING_KINDS.map((kind) => (
            <div key={kind} className="grid justify-items-center gap-2">
              <div className="flex items-end gap-4">
                {[14, 20, 28].map((size) => (
                  <span
                    key={size}
                    className={cn(
                      'inline-flex items-center justify-center rounded-[6px] p-1',
                      size === 14 && 'bg-secondary/60 ring-1 ring-border',
                    )}
                  >
                    <ThingKindIcon kind={kind} size={size} />
                  </span>
                ))}
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">{thingKindName(kind)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  </div>
);
PlusBadges.meta = { iframed: true };
