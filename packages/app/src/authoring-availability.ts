/**
 * What may be authored right now, given what is already in progress.
 *
 * One question with many answers, computed once per render and spent wherever a
 * surface offers or withholds a command (`CONTEXT.md`, Availability). It is the
 * whole of the withdrawal rule: the Space's command surface and the canvas read
 * the same answers, so an operation cannot be withdrawn at one of them and left
 * standing at the other.
 *
 * **It reads what is in progress and never the Space.** Whether a *proposed*
 * entity may exist — an Edge between two Things — is eligibility, taken against
 * the Space at the Space Authoring seam (`space-authoring.ts`'s
 * `EdgeEligibility`). One word each, two modules, different subjects.
 *
 * **An unavailable operation is not a refusal.** Nothing was attempted, so
 * there is no Edit to refuse: the answers below are bare booleans with no
 * refusal code and no reason field, because no consumer can draw one.
 * `EntityActionsMenu` has no disabled item at all — a command the entity does
 * not have is simply absent — and the Dock's own unavailable controls carry no
 * reason surface either. `diagram-resolution.ts` records the same standing
 * decision against a `reason` union whose second arm has no thrower.
 *
 * A pure function rather than a hook, deliberately: the rules are then provable
 * in the node environment against a table rather than through a mounted
 * application.
 */

/** The nine facts every answer below is derived from. */
export interface AuthoringInProgress {
  /**
   * Whether the selected Diagram's placement is ready for authoring.
   *
   * `App` reads it as `liveProjection !== null` — the projection it pushed into
   * the render adapter, read back out — so it is false through the window in
   * which a replacement placement is resolving and the store holds nothing.
   */
  readonly editable: boolean;
  /** A traversal of the Active Graph is running (ADR 0024). */
  readonly presenting: boolean;
  /**
   * A creation pane is open, whichever kind it is creating.
   *
   * The condition every surface outside the pane reads. Every kind is modal — a
   * focus trap and a backdrop over the whole graph area — so "one authoring
   * surface at a time" is one rule, and writing it as a disjunction at each of
   * its call sites is how a third kind would come to be withdrawn from some of
   * them.
   */
  readonly creatingThing: boolean;
  /** A Thing's Markdown content edit is running on the canvas (ADR 0064). */
  readonly editingThingBody: boolean;
  /** A Thing's inline title edit is running on the canvas (ADR 0065). */
  readonly editingThingTitle: boolean;
  /** Some Thing of the selected Diagram is Open (ADR 0064). */
  readonly thingIsOpen: boolean;
  /** A Space, Diagram or Graph rename is running in the Space chrome. */
  readonly editingChromeTitle: boolean;
  /**
   * This Space's canvas is the one the session is authoring right now.
   *
   * A mounted canvas is not by itself *the* canvas, in two ways: several Spaces
   * are open at once and each keeps its whole application mounted behind the
   * one on screen, and a Space Thing embeds another Space's Diagram inside this
   * one. Nothing may be authored on a canvas that is not the one, for the
   * reason the two surfaces above share — the canvas that *is* being authored
   * is the authoring surface already running.
   *
   * `App` reads it as "no open-set context, or this Space is the active one";
   * an isolated single-Space mount is always the Space on the canvas.
   * `EmbeddedDiagramAuthoring` reads the containing canvas's own answer for the
   * embedding it draws, which is this same question one level down.
   */
  readonly spaceOnCanvas: boolean;
  /**
   * Some embedded Diagram on this canvas is running a Thing edit of its own.
   *
   * A Space Thing draws another Space's Diagram inside this one, and a Thing edit
   * begun in there is a second authoring surface exactly as a creation pane is
   * — held apart from `editingThingBody` and `editingThingTitle` because those
   * name an edit of *this* Space's own Things, and this one is an edit of a
   * different Space that happens to be drawn within a Thing of this one.
   *
   * **Whether one is running, never which one.** Which embedding holds the
   * edit is what reinstates that embedding through `authorInEmbeddedDiagram`
   * below, and it is a question about a Thing of this canvas rather than about
   * what is in progress — so the identity stays with the canvas that draws the
   * embeddings and only this aggregate reaches here.
   *
   * The canvas reports it through the render adapter, beside `resizeDraft`:
   * that store is what re-renders the Space's command surface and the canvas
   * together, where a report through a callback prop would land an effect late.
   */
  readonly editingEmbeddedDiagram: boolean;
}

/** What each authoring operation answers to the surfaces that offer it. */
export interface AuthoringAvailability {
  /** The Things View may be opened, and may stay open. */
  readonly thingsView: boolean;
  /** A Space, Diagram or Graph rename may run in the chrome. */
  readonly chromeTitleEdit: boolean;
  /** An entity menu may offer its Rename and its Delete. */
  readonly entityEdits: boolean;
  /** The selected Thing may be deleted from the Space. */
  readonly deleteThing: boolean;
  /** Present may begin a traversal. */
  readonly present: boolean;
  /** A Thing may be created — from the toolbar, or by the canvas's own `C`. */
  readonly addThing: boolean;
  /** A Diagram may be created. */
  readonly createDiagram: boolean;
  /** The canvas's Thing controls and the whole Edge lifecycle may run. */
  readonly authorOnCanvas: boolean;
  /** An embedded Diagram drawn on this canvas may author the Space it draws. */
  readonly authorInEmbeddedDiagram: boolean;
  /** A live Thing content editor may stay mounted on the canvas. */
  readonly editThingBody: boolean;
  /** A drag may begin at a Thing's authoring handles. */
  readonly connectOnCanvas: boolean;
  /** React Flow may move a node. */
  readonly dragNodes: boolean;
  /** React Flow may focus and select nodes and Edges. */
  readonly selectNodes: boolean;
}

export function authoringAvailability(inProgress: AuthoringInProgress): AuthoringAvailability {
  const {
    editable,
    presenting,
    creatingThing,
    editingThingBody,
    editingThingTitle,
    thingIsOpen,
    editingChromeTitle,
    spaceOnCanvas,
    editingEmbeddedDiagram,
  } = inProgress;

  /**
   * No other authoring surface is running, so this canvas may be one.
   *
   * A fact of this module rather than an answer of it, because it is not an
   * operation: nothing offers this to an author. It says one authoring surface
   * at a time, and **the three terms earn that for different reasons**:
   *
   * - A creation pane is genuinely modal — a `Dialog`, with a backdrop across
   *   the whole graph area and a focus trap — so while it is open the canvas is
   *   covered and cannot be reached at all.
   * - A chrome title edit is *not* modal. It is an inline `InlineTitleEditor`
   *   standing in the Dock's own name control: no dialog role, no backdrop, no
   *   focus trap, and the canvas stays fully reachable behind it — the Dock
   *   floats over the canvas and takes nothing away from it (ADR 0082). It
   *   withdraws canvas
   *   authoring because a second authoring surface must not be startable over a
   *   live rename, not because anything is covering the graph.
   * - A canvas that is not the one being authored — a hidden Space, or an
   *   embedding the canvas above has withdrawn — is the third term and the one
   *   that is neither: it is not covered, it is simply not the canvas. Every
   *   open Space keeps its application mounted, so without this term a Space
   *   nobody is looking at answers `F2`, `C` and Enter from the `window`
   *   listeners its canvas installs, and the Space on screen answers them too.
   *
   * So do not read this as "the canvas is covered" and do not use it to decide
   * what a reader can perceive or reach — during a chrome rename a reader
   * reaches every node. It answers only what may be *started*.
   *
   * An Open Thing is deliberately neither: Opening is an ordinary Diagram Edit on
   * the canvas (ADR 0064), so it takes nothing away.
   *
   * It reached the canvas as a prop named `titleEditingEnabled` — named for the
   * first control it took away and read by all of them — and that name is gone
   * with the prop rather than renamed.
   */
  const soleAuthoringSurface = spaceOnCanvas && !creatingThing && !editingChromeTitle;

  /**
   * One condition for the Things View toggle's `disabled` and for the drawer's
   * own open state, so neither can drift from the other into an enabled control
   * over a drawer that will not open.
   *
   * Withdrawing the drawer *closes* it rather than hiding it behind a still-true
   * open state, because `Drawer.Popup` moves focus in on every open: a drawer
   * that reopened itself on the way back from presenting or from a creation
   * pane would take focus with it.
   */
  const thingsView = !presenting && !creatingThing;

  /**
   * Whether a chrome rename may run at all — the one answer for all three of
   * the Dock's names, the Space's included since `renamed-space`.
   *
   * `editable` is a term because while placement is pending there is no
   * projected canvas: a rename begun there is an editor with nothing behind it,
   * and the draft is discarded on the same render it was begun.
   */
  const chromeTitleEdit =
    editable && !presenting && !creatingThing && !editingThingBody && !editingThingTitle;

  /**
   * Whether a menu's Rename and Delete may be offered at all.
   *
   * Rename begins the very chrome title edit `chromeTitleEdit` governs — the
   * effect that discards a draft begun against that condition runs on the same
   * render — so this reads that answer itself rather than a second spelling of
   * it that can fall behind. It once was one, and what the copy dropped was
   * `editable`: while placement is pending, Rename opened an editor the effect
   * closed immediately and Delete Diagram ran a real Edit against a Space with
   * nothing drawn. Delete Diagram goes with Rename rather than standing alone in
   * a menu whose other item cannot run.
   *
   * `editingChromeTitle` is the term `chromeTitleEdit` does not carry: it is
   * what stops a second Rename beginning over a live one.
   *
   * The copy commands are deliberately **not** behind this: an address is a
   * fact about the entity rather than an Edit, and nothing about a live rename
   * or a presentation makes one uncopyable.
   */
  const entityEdits = chromeTitleEdit && !editingChromeTitle;

  /**
   * Delete Thing is withdrawn wherever the entity Edits are, and for one reason
   * more.
   *
   * It is a whole-Space authoring action on the *selected* Thing, so it reads
   * what a menu's Edits read — including `editingThingTitle`, which names the
   * selected Thing, and destroying the subject of a live rename is the edit
   * answering itself. Withdrawing it while a Thing is open is what keeps the
   * Diagram's Open state from outliving the Thing it names: nothing clears that
   * state on a Delete, so every affordance reading it would stay withdrawn with
   * no pane left to close.
   */
  const deleteThing = entityEdits && !thingIsOpen;

  /**
   * Present reads `editingThingBody` and nothing else about the canvas.
   *
   * Presenting draws the active Thing's content *instead of* the Thing, so a live
   * editor cannot survive it and the draft would go without one of ADR 0064's
   * four exits being spent. It does not read `presenting` itself — the surface
   * draws Stop rather than Present once a traversal is running — and it does
   * not read the two modal surfaces, which need nothing here: a creation pane
   * owns its own modality, and the editor is still there when it closes.
   */
  const present = !editingThingBody && !editingChromeTitle;

  /**
   * Add Thing reads `editingThingBody` for the reason Present does, and that term
   * is what makes the toolbar control agree with the `C` shortcut answering the
   * same operation on the canvas: Add Thing ends by putting a caret in the
   * created Thing's title editor, and title editing is withdrawn while a content
   * edit owns the keyboard (ADR 0064) — so a live toolbar created a Thing and
   * then swallowed the naming it exists to begin.
   *
   * It omits `editingThingTitle` deliberately: Add Thing *begins* a title edit
   * rather than outliving one. Add Diagram below takes the same condition and
   * that one term more.
   */
  const addThing = !presenting && !creatingThing && !editingThingBody && !editingChromeTitle;

  /**
   * Add Diagram is Add Thing plus `editingThingTitle`, and the extra term is this
   * control's own.
   *
   * Creating a Diagram selects it, and the created Diagram is empty — so the
   * canvas re-derives with no nodes and a Thing mid-rename unmounts, taking the
   * draft, the reason it was refused and the caret with it. A valid draft would
   * have been committed by the blur this button's own mousedown causes
   * (ADR 0065), which is precisely why a refused one is the case worth
   * withdrawing for: it is re-focused rather than settled, and nothing else
   * stands between the click and the Thing that holds it.
   */
  const createDiagram = addThing && !editingThingTitle;

  /**
   * What an embedded Diagram drawn on this canvas may author — and the three
   * ways this canvas is not the place an Edit is being made: no Things on it to
   * write into, another authoring surface already running, and a presentation
   * running.
   *
   * Each of those withdraws an embedding for the reason it withdraws the canvas
   * drawing it: a pane covers the embedding along with everything else on the
   * graph, a presentation replaces what is drawn, a chrome rename is the one
   * authoring surface, and a canvas that is not the one being authored cannot
   * have an authored embedding within it. `EmbeddedDiagramAuthoring` hands this
   * down as its own `spaceOnCanvas`, which is the same question one level down.
   *
   * The one term it does **not** take is the one it is about,
   * `editingEmbeddedDiagram`. An embedded edit is a second authoring surface for
   * the canvas *around* it, and withdrawing every embedding for it would end
   * the very edit that reported it — a title caret is dropped the moment its
   * canvas loses `authorOnCanvas`, so the edit would cancel itself on the
   * render it began. Which single embedding holds the edit stays the canvas's
   * own question: it spends this answer as it is, or withdraws every embedding
   * but the one that is editing.
   *
   * Every reason below withdraws an embedding for the reason it withdraws the
   * canvas drawing it: a pane covers the embedding along with everything else
   * on the graph, a presentation replaces what is drawn, a chrome rename is the
   * one authoring surface, and a canvas that is not the one being authored
   * cannot have an authored embedding within it. The `EmbeddedDiagramAuthoring`
   * that reads this hands it down as its own `spaceOnCanvas`, which is the same
   * question one level down.
   *
   * The one term it drops is the one it is about. An embedded edit is a second
   * authoring surface for the canvas *around* it, and withdrawing every
   * embedding for it would end the very edit that reported it — a title caret
   * is dropped the moment its canvas loses `authorOnCanvas`, so the edit would
   * cancel itself on the render it began. So the canvas is withdrawn and the
   * embeddings are not, and which single embedding holds the edit is the
   * canvas's own question: it takes this answer and reinstates nothing, or
   * withdraws every embedding but the one that is editing.
   */
  const authorInEmbeddedDiagram = editable && soleAuthoringSurface && !presenting;

  /**
   * One rule for everything the canvas authors — the Thing controls *and* the
   * whole Edge lifecycle.
   *
   * The toolbar's Add Thing is withdrawn on the first two terms above and so is
   * every control drawn on a Thing. **Edge authoring was the one thing reading a
   * shorter rule**, and the gap was not cosmetic: a pane covering the canvas
   * must withdraw its keyboard commands as well as its spatial gestures.
   *
   * `editingEmbeddedDiagram` is the fourth term, and it is deliberately **not**
   * in `soleAuthoringSurface`. It withdraws exactly what an embedded edit must
   * not be interrupted by: every control drawn on a containing Thing, and the
   * whole Edge editing lifecycle. It leaves `connectOnCanvas` alone, which is
   * the distinction presenting already draws here — a pointer connection is a
   * completed Edit rather than an editor, it cannot reach into the embedding,
   * and none of ADR 0064's four exits is spent by it. Moving the term into
   * `soleAuthoringSurface` would take that connection away, which is a decision
   * about the product rather than the collapse that moved this term off the
   * canvas.
   */
  const authorOnCanvas = authorInEmbeddedDiagram && !editingEmbeddedDiagram;

  /**
   * **The one authoring gesture presenting does not withdraw**, which is why
   * this is not `authorOnCanvas`.
   *
   * The difference is a product decision rather than an oversight: the
   * presenting chrome enumerates the active Thing's outgoing Edges at render
   * time precisely so an Edge drawn from the presented Thing is a move the
   * presenter can take without leaving the presentation (ADR 0027, and the
   * `moves()` note in `docs/agents/rendering.md`). `editing.spec.ts` authors a
   * self-Edge mid-presentation and asserts the chrome offers it.
   *
   * Another live authoring surface is different, and so is a canvas with no
   * Things on it yet — one is already taking the Edit, the other has nowhere to
   * write. React Flow's own
   * `nodesConnectable` read `editable && !presenting` for as long as it was
   * inert, and the first thing forwarding it to the authoring handles did was
   * break that presented-Thing connection. An expression nothing reads is not a
   * decision that was made.
   */
  const connectOnCanvas = editable && soleAuthoringSurface;

  /**
   * **Deliberately not `authorOnCanvas`**: a live content editor survives a
   * modal pane opening over the canvas.
   *
   * The pane owns its own modality, and the editor is still there when it
   * closes — so a Thing mid-edit is covered rather than settled, and none of
   * ADR 0064's four exits is spent behind the reader's back. What it cannot
   * survive is presenting, which draws the active Thing's content *instead of*
   * the Thing, and a placement that has not resolved, which has no Thing mounted
   * to hold it.
   */
  const editThingBody = editable && !presenting;

  /**
   * While presenting the arrow keys control traversal, so React Flow must not
   * also read them as moving or selecting a node. A canvas with no resolved
   * placement has nowhere to move a node to.
   *
   * The same rule as `editThingBody` and a different operation: a term added to
   * one of them is not thereby added to the other.
   */
  const dragNodes = editable && !presenting;
  const selectNodes = !presenting;

  return {
    thingsView,
    chromeTitleEdit,
    entityEdits,
    deleteThing,
    present,
    addThing,
    createDiagram,
    authorOnCanvas,
    authorInEmbeddedDiagram,
    editThingBody,
    connectOnCanvas,
    dragNodes,
    selectNodes,
  };
}
