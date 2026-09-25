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
 * entity may exist — an Edge between two Resources — is eligibility, taken against
 * the Space at the Space Authoring seam (`space-authoring.ts`'s
 * `EdgeEligibility`). One word each, two modules, different subjects.
 *
 * **An unavailable operation is not a refusal.** Nothing was attempted, so
 * there is no Edit to refuse: the answers below are bare booleans with no
 * refusal code and no reason field, because no consumer can draw one.
 * `EntityActionsMenu` has no disabled item at all — a command the entity does
 * not have is simply absent — and the Dock's own unavailable controls carry no
 * reason surface either. `map-resolution.ts` records the same standing
 * decision against a `reason` union whose second arm has no thrower.
 *
 * A pure function rather than a hook, deliberately: the rules are then provable
 * in the node environment against a table rather than through a mounted
 * application.
 */

/**
 * The nine facts every answer below is derived from.
 *
 * Every Resource creation completes its Edit on activation, so there is no
 * modal creation surface for the rest of the product to stand out of the way
 * of. `creatingSpaceResource` is the one async creation: its coordinated Edit
 * lands one await after the press, and the Space Resource peer is
 * withdrawn for that window rather than swallowing a second press silently.
 */
export interface AuthoringInProgress {
  /**
   * Whether the selected Map's placement is ready for authoring.
   *
   * `App` reads it as `liveProjection !== null` — the projection it pushed into
   * the render adapter, read back out — so it is false through the window in
   * which a replacement placement is resolving and the store holds nothing.
   */
  readonly editable: boolean;
  /** A traversal of the Active Graph is running (ADR 0024). */
  readonly presenting: boolean;
  /** A Resource's Markdown content edit is running on the canvas (ADR 0064). */
  readonly editingResourceBody: boolean;
  /** A Resource's inline title edit is running on the canvas (ADR 0065). */
  readonly editingResourceTitle: boolean;
  /** Some Resource of the selected Map is Open (ADR 0064). */
  readonly resourceIsOpen: boolean;
  /** A Space, Map or Graph rename is running in the Space chrome. */
  readonly editingChromeTitle: boolean;
  /**
   * This Space's canvas is the one the session is authoring right now.
   *
   * A mounted canvas is not by itself *the* canvas, in two ways: several Spaces
   * are open at once and each keeps its whole application mounted behind the
   * one on screen, and a Space Resource embeds another Space's Map inside this
   * one. Nothing may be authored on a canvas that is not the one, for the
   * reason the two surfaces above share — the canvas that *is* being authored
   * is the authoring surface already running.
   *
   * `App` reads it as "no open-set context, or this Space is the active one";
   * an isolated single-Space mount is always the Space on the canvas.
   * `EmbeddedMapAuthoring` reads the containing canvas's own answer for the
   * embedding it draws, which is this same question one level down.
   */
  readonly spaceOnCanvas: boolean;
  /**
   * Some embedded Map on this canvas is running a Resource edit of its own.
   *
   * A Space Resource draws another Space's Map inside this one, and a Resource edit
   * begun in there is a second authoring surface exactly as a Markdown body edit is
   * — held apart from `editingResourceBody` and `editingResourceTitle` because those
   * name an edit of *this* Space's own Resources, and this one is an edit of a
   * different Space that happens to be drawn within a Resource of this one.
   *
   * **Whether one is running, never which one.** Which embedding holds the
   * edit is what reinstates that embedding through `authorInEmbeddedMap`
   * below, and it is a question about a Resource of this canvas rather than about
   * what is in progress — so the identity stays with the canvas that draws the
   * embeddings and only this aggregate reaches here.
   *
   * The canvas reports it through the render adapter, beside `resizeDraft`:
   * that store is what re-renders the Space's command surface and the canvas
   * together, where a report through a callback prop would land an effect late.
   */
  readonly editingEmbeddedMap: boolean;
  /** A Space Resource coordinated Edit is in flight (command-dock issue 23). */
  readonly creatingSpaceResource: boolean;
}

/** What each authoring operation answers to the surfaces that offer it. */
export interface AuthoringAvailability {
  /** The Resources View may be opened, and may stay open. */
  readonly resourcesView: boolean;
  /** A Space, Map or Graph rename may run in the chrome. */
  readonly chromeTitleEdit: boolean;
  /** An entity menu may offer its Rename and its Delete. */
  readonly entityEdits: boolean;
  /** The selected Resource may be deleted from the Space. */
  readonly deleteResource: boolean;
  /** Present may begin a traversal. */
  readonly present: boolean;
  /** A Resource may be created — from the toolbar, or by the canvas's own `C`. */
  readonly addResource: boolean;
  /** The Create Space Resource peer may run — withdrawn while its Edit is in flight. */
  readonly createSpaceResource: boolean;
  /** A Map may be created. */
  readonly createMap: boolean;
  /** The canvas's Resource controls and the whole Edge lifecycle may run. */
  readonly authorOnCanvas: boolean;
  /** An embedded Map drawn on this canvas may author the Space it draws. */
  readonly authorInEmbeddedMap: boolean;
  /** A live Resource content editor may stay mounted on the canvas. */
  readonly editResourceBody: boolean;
  /** A drag may begin at a Resource's authoring handles. */
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
    editingResourceBody,
    editingResourceTitle,
    resourceIsOpen,
    editingChromeTitle,
    spaceOnCanvas,
    editingEmbeddedMap,
    creatingSpaceResource,
  } = inProgress;

  /**
   * No other authoring surface is running, so this canvas may be one.
   *
   * A fact of this module rather than an answer of it, because it is not an
   * operation: nothing offers this to an author. It says one authoring surface
   * at a time, and **the two terms earn that for different reasons**:
   *
   * - A chrome title edit is *not* modal. It is an inline `InlineTitleEditor`
   *   standing in the Dock's own name control: no dialog role, no backdrop, no
   *   focus trap, and the canvas stays fully reachable behind it — the Dock
   *   floats over the canvas and takes nothing away from it (ADR 0082). It
   *   withdraws canvas
   *   authoring because a second authoring surface must not be startable over a
   *   live rename, not because anything is covering the graph.
   * - A canvas that is not the one being authored — a hidden Space, or an
   *   embedding the canvas above has withdrawn — is the other term and the one
   *   that is neither: it is not covered, it is simply not the canvas. Every
   *   open Space keeps its application mounted, so without this term a Space
   *   nobody is looking at answers `F2`, `C` and Enter from the `window`
   *   listeners its canvas installs, and the Space on screen answers them too.
   *
   * So do not read this as "the canvas is covered" and do not use it to decide
   * what a reader can perceive or reach — during a chrome rename a reader
   * reaches every node. It answers only what may be *started*.
   *
   * An Open Resource is deliberately neither: Opening is an ordinary Map Edit on
   * the canvas (ADR 0064), so it takes nothing away.
   */
  const soleAuthoringSurface = spaceOnCanvas && !editingChromeTitle;

  /**
   * One condition for the Resources list's `disabled` and for the Dock slot that
   * holds it open, so neither can drift from the other into an enabled control
   * over a list that will not open.
   *
   * Withdrawing the list *closes* it rather than hiding it behind a still-true
   * open state. The open state is the Dock's — `ResourcesList` clears its
   * disclosure slot when this goes false — and a list that reopened itself on
   * the way back from presenting would take focus with it, landing the reader
   * in the Resources rather than on the canvas they returned to.
   */
  const resourcesView = !presenting;

  /**
   * Whether a chrome rename may run at all — the one answer for all three of
   * the Dock's names, the Space's included since `renamed-space`.
   *
   * `editable` is a term because while placement is pending there is no
   * projected canvas: a rename begun there is an editor with nothing behind it,
   * and the draft is discarded on the same render it was begun.
   */
  const chromeTitleEdit = editable && !presenting && !editingResourceBody && !editingResourceTitle;

  /**
   * Whether a menu's Rename and Delete may be offered at all.
   *
   * Rename begins the very chrome title edit `chromeTitleEdit` governs — the
   * effect that discards a draft begun against that condition runs on the same
   * render — so this reads that answer itself rather than a second spelling of
   * it that can fall behind. A copy that drops `editable` lets Rename open an
   * editor the effect closes immediately while placement is pending, and lets
   * Delete Map run a real Edit against a Space with nothing drawn. Delete Map
   * goes with Rename rather than standing alone in a menu whose other item
   * cannot run.
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
   * Delete Resource is withdrawn wherever the entity Edits are, and for one reason
   * more.
   *
   * It is a whole-Space authoring action on the *selected* Resource, so it reads
   * what a menu's Edits read — including `editingResourceTitle`, which names the
   * selected Resource, and destroying the subject of a live rename is the edit
   * answering itself. Withdrawing it while a Resource is open is what keeps the
   * Map's Open state from outliving the Resource it names: nothing clears that
   * state on a Delete, so every affordance reading it would stay withdrawn with
   * no pane left to close.
   */
  const deleteResource = entityEdits && !resourceIsOpen;

  /**
   * Present reads `editingResourceBody` and nothing else about the canvas.
   *
   * Presenting draws the active Resource's content *instead of* the Resource, so a live
   * editor cannot survive it and the draft would go without one of ADR 0064's
   * four exits being spent. It does not read `presenting` itself — the surface
   * draws Stop rather than Present once a traversal is running.
   */
  const present = !editingResourceBody && !editingChromeTitle;

  /**
   * Add Resource reads `editingResourceBody` for the reason Present does, and that term
   * is what makes the toolbar control agree with the `C` shortcut answering the
   * same operation on the canvas: Add Resource ends by putting a caret in the
   * created Resource's title editor, and title editing is withdrawn while a content
   * edit owns the keyboard (ADR 0064) — so a live toolbar would create a
   * Resource and then swallow the naming it exists to begin.
   *
   * It omits `editingResourceTitle` deliberately: Add Resource *begins* a title edit
   * rather than outliving one. Add Map below takes the same condition and
   * the name readiness it needs for its continuation.
   */
  const addResource = !presenting && !editingResourceBody && !editingChromeTitle;

  /**
   * Create Space Resource reads `addResource` and one term of its own.
   *
   * The coordinated Edit is optimistic — the Resource is drawn before the durable
   * commit settles — but a second press before it installs would reuse the same
   * title and anchor and replace the first continuation. Add Markdown Resource is
   * synchronous and stays on `addResource`; only this peer is withdrawn for the
   * window.
   */
  const createSpaceResource = addResource && !creatingSpaceResource;

  /**
   * Add Map needs its naming continuation available as well as Add Resource.
   *
   * Creating a Map selects it, and the created Map is empty — so the
   * canvas re-derives with no nodes and a Resource mid-rename unmounts, taking the
   * draft, the reason it was refused and the caret with it. A valid draft would
   * have been committed by the blur this button's own mousedown causes
   * (ADR 0065), which is precisely why a refused one is the case worth
   * withdrawing for: it is re-focused rather than settled, and nothing else
   * stands between the click and the Resource that holds it. Placement must also
   * be ready: the new Map continues in its name, and an unavailable name
   * cannot take the caret from the menu.
   */
  const createMap = addResource && chromeTitleEdit;

  /**
   * What an embedded Map drawn on this canvas may author — and the three
   * ways this canvas is not the place an Edit is being made: no Resources on it to
   * write into, another authoring surface already running, and a presentation
   * running.
   *
   * Each of those withdraws an embedding for the reason it withdraws the canvas
   * drawing it: a presentation replaces what is drawn, a chrome rename is the
   * one authoring surface, and a canvas that is not the one being authored
   * cannot have an authored embedding within it. `EmbeddedMapAuthoring` hands
   * this down as its own `spaceOnCanvas`, which is the same question one level
   * down.
   *
   * The one term it does **not** take is the one it is about,
   * `editingEmbeddedMap`. An embedded edit is a second authoring surface for
   * the canvas *around* it, and withdrawing every embedding for it would end
   * the very edit that reported it — a title caret is dropped the moment its
   * canvas loses `authorOnCanvas`, so the edit would cancel itself on the
   * render it began. So the canvas is withdrawn and the embeddings are not, and
   * which single embedding holds the edit is the canvas's own question: it
   * spends this answer as it is, or withdraws every embedding but the one that
   * is editing.
   */
  const authorInEmbeddedMap = editable && soleAuthoringSurface && !presenting;

  /**
   * One rule for everything the canvas authors — the Resource controls *and* the
   * whole Edge lifecycle.
   *
   * The toolbar's Add Resource is withdrawn on the first two terms above and so is
   * every control drawn on a Resource. Edge authoring reads the same rule: a
   * canvas that is not the one being authored must withdraw its keyboard
   * commands as well as its spatial gestures.
   *
   * `editingEmbeddedMap` is the fourth term, and it is deliberately **not**
   * in `soleAuthoringSurface`. It withdraws exactly what an embedded edit must
   * not be interrupted by: every control drawn on a containing Resource, and the
   * whole Edge editing lifecycle. It leaves `connectOnCanvas` alone, which is
   * the distinction presenting already draws here — a pointer connection is a
   * completed Edit rather than an editor, it cannot reach into the embedding,
   * and none of ADR 0064's four exits is spent by it. Moving the term into
   * `soleAuthoringSurface` would take that connection away, which is a decision
   * about the product rather than a simplification.
   */
  const authorOnCanvas = authorInEmbeddedMap && !editingEmbeddedMap;

  /**
   * **The one authoring gesture presenting does not withdraw**, which is why
   * this is not `authorOnCanvas`.
   *
   * The difference is a product decision rather than an oversight: the
   * presenting chrome enumerates the active Resource's outgoing Edges at render
   * time precisely so an Edge drawn from the presented Resource is a move the
   * presenter can take without leaving the presentation (ADR 0027, and the
   * `moves()` note in `docs/agents/rendering.md`). `editing.spec.ts` authors a
   * self-Edge mid-presentation and asserts the chrome offers it.
   *
   * Another live authoring surface is different, and so is a canvas with no
   * Resources on it yet — one is already taking the Edit, the other has nowhere to
   * write. Do not add `!presenting` here: it takes away that presented-Resource
   * connection.
   */
  const connectOnCanvas = editable && soleAuthoringSurface;

  /**
   * **Deliberately not `authorOnCanvas`**: a live content editor survives a
   * modal dialog opening over the canvas.
   *
   * The dialog owns its own modality, and the editor is still there when it
   * closes — so a Resource mid-edit is covered rather than settled, and none of
   * ADR 0064's four exits is spent behind the reader's back. What it cannot
   * survive is presenting, which draws the active Resource's content *instead of*
   * the Resource, and a placement that has not resolved, which has no Resource mounted
   * to hold it.
   */
  const editResourceBody = editable && !presenting;

  /**
   * While presenting the arrow keys control traversal, so React Flow must not
   * also read them as moving or selecting a node. A canvas with no resolved
   * placement has nowhere to move a node to.
   *
   * The same rule as `editResourceBody` and a different operation: a term added to
   * one of them is not thereby added to the other.
   */
  const dragNodes = editable && !presenting;
  const selectNodes = !presenting;

  return {
    resourcesView,
    chromeTitleEdit,
    entityEdits,
    deleteResource,
    present,
    addResource,
    createSpaceResource,
    createMap,
    authorOnCanvas,
    authorInEmbeddedMap,
    editResourceBody,
    connectOnCanvas,
    dragNodes,
    selectNodes,
  };
}
