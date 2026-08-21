import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell } from '@project/ui';
import {
  cardDocumentSchema,
  newUuid,
  uuidSchema,
  type Card,
  type CardId,
  type LayoutPosition,
} from '@project/core';
import { Placement, graphCardIds, type ResolvedContentCard } from '@project/graph';
import type { OpenedSpace } from './space';
import { createSpaceAuthoring, type AuthoringRefusal } from './space-authoring';
import { describeAuthoringRefusal } from './authoring-refusal';
import { createRenderAdapter, selectedCardOf, type EdgeSubject } from './render-adapter';
import { createConnectionCompletion } from './connection-completion';
import { createEdgeAuthoring } from './edge-authoring';
import { canvasProjection } from './canvas-projection';
import { canvasRenderers, currentRenderer } from './canvas-renderers';
import { canvasContent } from './canvas-content';
import { usePlacementRendering } from './placement-rendering';
import { cardSizeVars } from './card';
import { canRetreat, createNavigation } from './navigation';
import { usePresentingKeys } from './presenting-keys';
import { createWorkingSpaceReader } from './snapshot';
import { nextCardTitle } from './titles';
import { activeGraphColor } from './colors';
import { createRendererResolver, defaultRenderer, type CanvasRendererId } from './renderer';
import { ADD_CARD_KEY, SpaceCanvas } from './components/SpaceCanvas';
import { CanvasCentre, type VisibleCentre } from './components/CanvasCentre';
import { NewAlias } from './components/NewAlias';
import { OpenCard } from './components/OpenCard';
import { PlacementFailure } from './components/PlacementFailure';
import { PlacementPending } from './components/PlacementPending';
import { PresentingChrome } from './components/PresentingChrome';
import { PersistenceControl, PersistenceNotice } from './components/PersistenceControl';
import { SelectedCanvasRenderer, WorkspaceSidebar } from './components/WorkspaceSidebar';

export const createApp = ({ space, spaceSession }: OpenedSpace) => {
  // One validated aggregate per working snapshot, shared by the render path and
  // by Navigation. Both read the same reader, so in the steady state a snapshot
  // is parsed and indexed once rather than once per render — and both see the
  // same `Space` identity, which is what the render memos below hang on.
  const readWorkingSpace = createWorkingSpaceReader();
  const currentSpace = () => readWorkingSpace(spaceSession.getState().working);
  // **One resolver for the whole composition**, handed to every collaborator
  // that needs one. Nondeterminism is injected here rather than reached for
  // inside a domain operation: a converted Graph's identity comes from
  // `newGraphId`, so a test composes a deterministic resolver instead of mocking
  // a global, and nothing downstream has to name identity minting at all.
  const resolveRenderer = createRendererResolver({ newGraphId: newUuid });
  // Which renderer this space opens in, and the strategy that arranges it. The
  // fixture declares no view, so this resolves to the graph-driven ELK graph —
  // exactly what the hardcoded `elkStrategy()` here used to do. It also answers
  // which graphs are drawn and which of them opens active (ADR 0026), so it has
  // to resolve before the store is built.
  const initialSelection = defaultRenderer(space);
  const initialRenderer = resolveRenderer(space, initialSelection);
  const navigation = createNavigation(currentSpace, resolveRenderer, initialSelection, space);

  // Live nodes hold whichever arrangement is on screen. A selected Layout also
  // supplies its already-authored, possibly sparse map; a View starts null and
  // is promoted only by a completed edit (ADR 0025).
  const initialPlacement =
    initialRenderer.kind === 'view'
      ? null
      : Placement.fromLayout(initialRenderer.resolvedLayout.layout);
  const authoring = createSpaceAuthoring({
    session: spaceSession,
    navigation,
    currentSpace,
    resolveRenderer,
    initialPlacement,
  });
  const useRenderAdapter = createRenderAdapter(authoring);
  // The Edge lifecycle, composed once beside the two collaborators it consumes.
  // It owns neither: the render adapter stays authoritative for the projection
  // and the canvas selection, Space Authoring for eligibility and every Edit.
  const edgeAuthoring = createEdgeAuthoring({
    authoring,
    adapter: useRenderAdapter,
    connections: createConnectionCompletion({ adapter: useRenderAdapter, authoring }),
  });

  function App() {
    const authoringState = useSyncExternalStore(authoring.subscribe, authoring.getState);
    const sessionState = authoringState.session;
    const navigationState = authoringState.navigation;
    const selectedRenderer = navigationState.selectedRenderer;
    /**
     * The Alias creation state: editor-local, and nothing else (ADR 0042).
     *
     * There is no draft Card here and nothing reserved in the Space — an Alias
     * without a Target is not a valid Card, so what is open is a surface rather
     * than a partial entity. Closing it creates nothing.
     */
    const [creatingAlias, setCreatingAlias] = useState(false);
    const [aliasRefusal, setAliasRefusal] = useState<AuthoringRefusal | null>(null);
    /** The Card a completed creation asks the canvas to open its name editor on. */
    const [createdCardId, setCreatedCardId] = useState<CardId | null>(null);
    const rendererSpace = useMemo(
      () => readWorkingSpace(sessionState.working),
      [sessionState.working],
    );
    const renderer = useMemo(
      () => resolveRenderer(rendererSpace, selectedRenderer),
      [rendererSpace, selectedRenderer],
    );
    const renderers = useMemo(() => canvasRenderers(rendererSpace), [rendererSpace]);
    const current = useMemo(
      () => currentRenderer(renderers, selectedRenderer),
      [renderers, selectedRenderer],
    );
    // Everything the canvas draws, derived once from the Space and the renderer.
    // Memoized on those two alone: the interaction state below changes far more
    // often, and it is `project` that reads it rather than this.
    const projection = useMemo(
      () => canvasProjection(rendererSpace, renderer),
      [rendererSpace, renderer],
    );

    const { activeGraphId, openedCardId } = navigationState;
    const editorGraphColor = activeGraphColor(projection.colors, activeGraphId);
    const activateGraph = navigation.activateGraph;
    const openCard = navigation.openCard;
    const closeCard = navigation.closeCard;
    const presenting = navigationState.mode === 'presenting';
    // There is a Card to go back to only once a traversal has left its first, and only
    // presenting has Traversal history at all — the same narrowing the alias above already
    // makes, spent here on the value behind it rather than on the mode.
    const present = navigation.present;
    const exitPresenting = navigation.exitPresenting;
    const advance = navigation.advance;
    const retreat = navigation.retreat;
    const selectBranch = navigation.selectBranch;
    const activeCardId = navigation.activeCardId();
    // Derived here rather than in a store selector: the array is rebuilt on every
    // call, so a selector would hand Zustand a new identity each render — a
    // re-render producing a new value producing a re-render, until React gives up.
    // That is still the rule; what is deliberate is that this is a plain render
    // computation and **not** memoized.
    //
    // Navigation reads the session's current working Space. Authoring an Edge from
    // the Card being presented leaves the navigation values unchanged, so deriving
    // moves during render makes the newly authored Edge immediately traversable.
    // A render-time call is not the selector case above — nothing subscribes to
    // this identity, so a fresh array cannot feed a re-render — and the work is a
    // filter and a map over one Graph's Edges, or nothing at all outside presentation.
    const moves = navigation.moves();

    // Read at the point of use, like `moves` above and for the same reason: the
    // placement is not published state, and subscribing to it through the
    // render adapter — a store that knows nothing about either the placement or
    // the selected renderer — only worked because every install happened to be
    // followed by an unrelated notification. This component already re-renders
    // on both stores, and a render-time read cannot be stale at the render that
    // uses it. `replacePlacement` keeps the map's identity when the value is
    // unchanged, so this does not defeat the memo below.
    const authoredPositions = authoring.authoredPlacement();
    const selection = useRenderAdapter((s) => s.selection);
    const selectedCardId = selectedCardOf(selection);
    const moved = useRenderAdapter((s) => s.moved);
    const placement = usePlacementRendering(
      projection.strategyGraph,
      renderer.strategy,
      authoredPositions,
    );
    const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;

    // Nothing is worth projecting before a strategy resolves — every card would
    // sit at the origin — and `project` will not take a null arrangement, so this
    // is the whole of that gate rather than a rule the sync effect remembers.
    const projected = useMemo(
      () =>
        laidOut === null
          ? null
          : projection.project(laidOut, {
              activeGraphId,
              activeCardId,
              selectedCardId,
              presenting,
              moved,
            }),
      [projection, laidOut, activeGraphId, activeCardId, selectedCardId, presenting, moved],
    );

    // Hand the complete projection to the render adapter as one state change.
    // A Card keeps its live position, measured size and drag state, while an Edge
    // can never become visible before the endpoint nodes declare its handles.
    const syncProjection = useRenderAdapter((s) => s.syncProjection);
    useEffect(() => {
      if (projected) syncProjection(projected.nodes, projected.edges);
    }, [projected, syncProjection]);

    const liveProjection = useRenderAdapter((s) => s.projection);
    const changeNodes = useRenderAdapter((s) => s.changeNodes);
    const changeEdges = useRenderAdapter((s) => s.changeEdges);
    // There is an arrangement to drag once the layout has resolved and the store
    // has taken it. Not a permission — every view is editable (ADR 0025) — but it
    // is false for the frame before the first placement resolves, and again after
    // `selectRenderer` clears the projection until the next one is published.
    const hasArrangement = liveProjection !== null;
    const canvas = canvasContent(placement, hasArrangement);
    const editable = hasArrangement;

    // One decision resolved from one Space, applied in an order that cannot
    // leave the two collaborators disagreeing.
    //
    // Both steps that may refuse the selection run first — the resolve here and
    // Navigation's own — and the render adapter update is a plain store write
    // that cannot fail. Resolving against the session's live Space rather than
    // the rendered one matters because Navigation resolves against the live one
    // too: deciding from a snapshot Navigation will not consult is one decision
    // with two sources of truth.
    const selectCanvasRenderer = useCallback((selection: CanvasRendererId) => {
      const resolved = resolveRenderer(currentSpace(), selection);
      navigation.selectRenderer(selection);
      useRenderAdapter
        .getState()
        .selectRenderer(
          resolved.kind === 'view' ? null : Placement.fromLayout(resolved.resolvedLayout.layout),
        );
    }, []);

    // Leaving while persistence is not settled asks first. The handler is absent
    // in the normal durable state, preserving the browser's back/forward cache.
    useEffect(() => {
      if (sessionState.persistence.kind === 'settled') return;
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        // `preventDefault` alone. The old pairing with `event.returnValue = ''` is
        // deprecated — lint rejects it outright — and current Chromium, Firefox
        // and Safari all honour the spec'd call. Don't add it back for the sake of
        // a browser this prototype does not run in.
        event.preventDefault();
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [sessionState.persistence.kind]);

    const activeGraphCardIds = useMemo(
      () => new Set(activeGraphId === null ? [] : graphCardIds(rendererSpace, activeGraphId)),
      [rendererSpace, activeGraphId],
    );

    // The two selection writes the canvas makes that are not React Flow's own —
    // continuing at a connected Card, and the focus-to-selection bridge for an
    // Edge. Both are plain store writes with nothing to decide.
    const selectCard = useCallback((cardId: CardId) => {
      useRenderAdapter.getState().selectCard(cardId);
    }, []);

    const selectEdge = useCallback((subject: EdgeSubject) => {
      useRenderAdapter.getState().selectEdge(subject);
    }, []);

    /**
     * Where a Card created from a control rather than a pointer goes.
     *
     * Read at the gesture, never captured earlier: an author who pans between
     * opening the Alias picker and choosing a Target is looking somewhere else
     * by the time the Card is placed, and the whole point of the visible centre
     * is that it is where they are looking now.
     */
    const visibleCentre = useRef<VisibleCentre | null>(null);
    const reportVisibleCentre = useCallback((centre: VisibleCentre | null) => {
      visibleCentre.current = centre;
    }, []);
    // The origin is unreachable in practice — the control is withdrawn until an
    // arrangement resolves, and the reporter is mounted with it — but a created
    // Card must land *somewhere*, and a refusal would be the wrong answer to a
    // question about geometry.
    const centreAnchor = (): LayoutPosition => visibleCentre.current?.() ?? { x: 0, y: 0 };

    /**
     * Add Card: one completed Edit, and then the naming continuation.
     *
     * **This is the one operation whose refusal no surface shows, and that is a
     * decision rather than an oversight** — the asymmetry with `createAlias`
     * below is the thing to read, so here is why it stands. A refusal carries a
     * sentence for the author (ADR 0042), which is worth showing exactly where
     * the author can act on it: the Alias pane keeps its own open because both
     * of its refusals are about the Target just chosen, and the field that
     * answers them is on screen. Add Card takes no input at all. It completes on
     * one activation, from a toolbar button and a keystroke, and leaves nothing
     * standing that a sentence could correct.
     *
     * Both refusals it can produce also turn on state the control is already
     * withdrawn in. `disabled` on `AddCardControl` and `canAuthorCards` in
     * `SpaceCanvas` are both gated on `editable`, which is `hasArrangement` —
     * and no arrangement is the first refusal ("nowhere to write yet"). The
     * second is a Layout that has left the Space, which would have taken the
     * canvas drawing it, and `editable` with it. Neither is reachable from
     * either path, so a surface built for them could not be exercised, and an
     * untestable surface for an unreachable state is worth less than this
     * paragraph.
     *
     * What that argument does *not* license is a catch-all, so each outcome is
     * named below. If Add Card ever grows an input — a kind, a title, a
     * placement mode — it grows a surface with it, and the refusal goes there.
     */
    const addCard = useCallback(() => {
      const created = authoring.complete({ kind: 'created-card', anchor: centreAnchor() });
      // Each outcome named rather than caught. `refused` is the paragraph
      // above. `queued` is an Edit that will still be performed, whose
      // projection draws the Card without help from here. `unchanged` this
      // operation cannot answer — it mints unconditionally — but the shared
      // completion union carries it, so it is narrowed rather than asserted
      // away, and the day one of these grows an answer the compiler asks here.
      if (created.kind === 'refused') return;
      if (created.kind === 'queued') return;
      if (created.kind === 'unchanged') return;
      if (created.createdCardId === undefined) return;
      // Selected as well as named: the storyboard's created Card is the selected
      // one, so continued authoring — a connection, a second Card — carries on
      // from it.
      useRenderAdapter.getState().selectCard(created.createdCardId);
      setCreatedCardId(created.createdCardId);
    }, []);

    /**
     * Add Alias: the Target choice *is* the creation (ADR 0009's storyboard).
     *
     * A refusal keeps the surface open with its reason, because the two the
     * creation can raise are about the Target the author just chose — it has
     * left the Space, or it is an Alias itself — and closing would take away the
     * field that answers them.
     *
     * Handed on whole rather than checked against that pair first. The check was
     * a string comparison ending in a `throw`, which is a crash inside a React
     * event callback — a blank canvas — for the one case it was written to catch,
     * and the pane places every refusal it is given.
     */
    const createAlias = useCallback(
      (target: CardId, title: string) => {
        const created = authoring.complete({
          kind: 'created-alias',
          target,
          // Exactly as typed, empty string included: an empty title is how
          // Authoring is told to take the Target's own.
          title,
          anchor: centreAnchor(),
        });
        if (created.kind === 'refused') {
          setAliasRefusal(created.refusal);
          return;
        }
        // The surface comes down only where the continuations below will run,
        // which is why the narrowing precedes it rather than following it.
        // `queued` is an Edit that lands later from the drain, and it cannot
        // honour "the editor stays open on the Alias that now exists" — so it
        // must not take the creation pane with it either, or an empty title
        // leaves the author holding two identically titled Cards and no
        // surface to rename either from. `unchanged` this operation cannot
        // answer: it mints, or it refuses.
        //
        // Neither is reachable from here today. `queued` needs a completion
        // raised from inside an install window, and this one is a cmdk
        // selection at the top of its own stack. Named rather than trusted to
        // stay that way, as Add Card names its own.
        if (created.kind === 'queued') return;
        if (created.kind === 'unchanged') return;
        if (created.createdCardId === undefined) return;
        setCreatingAlias(false);
        setAliasRefusal(null);
        useRenderAdapter.getState().selectCard(created.createdCardId);
        // The editor stays open on the Alias that now exists, which is where the
        // author already was.
        openCard(created.createdCardId);
      },
      [openCard],
    );

    /**
     * Leaving the Alias creation state, having created nothing.
     *
     * Focus goes back to the control the menu was opened from — Radix's own
     * destination when a menu closes, arriving here by the same reasoning rather
     * than as a second opinion. Only a *cancelled* creation restores it: a
     * completed one hands focus to the editor now open on the Alias, and taking
     * it back would be a steal.
     *
     * It has to wait for the render that closes the pane. The control is
     * disabled while the pane is open — one authoring surface at a time — and a
     * disabled button cannot take focus, so restoring inside the handler
     * silently does nothing and leaves focus on `<body>`. The button is only
     * disabled and never unmounted, so the ref still holds it when the wait ends.
     */
    const addCardMenu = useRef<HTMLButtonElement>(null);
    const restoringAddCardFocus = useRef(false);
    // A refusal outlives the attempt that produced it unless something withdraws
    // it. Success, cancellation and presenting all did; editing the pane's own
    // fields did not, so an alert describing a rejected Target stayed under a
    // title the author had since rewritten.
    const clearAliasRefusal = useCallback(() => setAliasRefusal(null), []);
    const cancelAlias = useCallback(() => {
      restoringAddCardFocus.current = true;
      setCreatingAlias(false);
      setAliasRefusal(null);
    }, []);
    useEffect(() => {
      if (creatingAlias || !restoringAddCardFocus.current) return;
      restoringAddCardFocus.current = false;
      addCardMenu.current?.focus();
    }, [creatingAlias]);

    /**
     * Presenting closes the Alias creation state, creating nothing.
     *
     * Navigation already does this for an opened Card — `present` clears
     * `openedCardId` — but this surface is App's own, and the toolbar it is
     * started from is not covered by the pane. Keyed on the fact rather than
     * wrapped around the control, so a second way into presenting cannot leave a
     * creation state open over a presentation.
     */
    useEffect(() => {
      if (!presenting) return;
      setCreatingAlias(false);
      setAliasRefusal(null);
    }, [presenting]);

    const completeCardTitle = useCallback((cardIdInput: string, title: string): string | null => {
      const cardId = uuidSchema.safeParse(cardIdInput);
      if (!cardId.success) return 'This Card is no longer available.';
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId.data);
      if (stored === undefined) return 'This Card is no longer available.';
      // Trimmed, because `z.string().min(1)` counts characters and a space is
      // one: the schema alone accepts a title that draws as nothing, leaving a
      // Card indistinguishable from its neighbours and an `Edit title of` label
      // naming nobody. Blank is the empty case wearing different bytes.
      const named = title.trim();
      const parsed = cardDocumentSchema.safeParse({ ...stored.document, title: named });
      if (!parsed.success) {
        return named.length === 0
          ? 'A Card title is required.'
          : (parsed.error.issues[0]?.message ?? 'The Card title is invalid.');
      }
      const result = authoring.complete({
        kind: 'edited-card',
        cardId: cardId.data,
        document: parsed.data,
      });
      switch (result.kind) {
        case 'refused':
          return describeAuthoringRefusal(result.refusal);
        case 'completed':
        case 'unchanged':
        case 'queued':
          return null;
      }
    }, []);

    // Every Card the Space holds, and deliberately no narrower: a Card's kind
    // decides which fields the pane draws, never whether it opens. An Alias is
    // editable on its own metadata (ADR 0049), not only through the Card whose
    // content it resolves to, so there is nothing left for a filter here to
    // remove — the resolve-to-content test that used to stand in this `map` said
    // an Alias could be opened only as a way to reach another Card, which is the
    // reading 0049 withdrew.
    //
    // It is a set rather than a plain count because both readers ask membership
    // of an id they did not choose: the canvas asks it per node to decide
    // whether that Card offers its editing affordance, and `openCardForEditing`
    // below asks it of a string arriving from React Flow, which names a Card of
    // this Space only by convention.
    const editableCardIds = useMemo(
      () => new Set(rendererSpace.cards.map((card) => card.id)),
      [rendererSpace],
    );
    const openCardForEditing = useCallback(
      (cardIdInput: string): void => {
        // An opened Card covers the graph, so a pointer cannot reach a second
        // one — but the pane traps no focus, and `Enter` on a node still behind
        // it asked to open that Card, swapping the pane's subject out from under
        // a draft in progress. Declining here matches what the pointer can do.
        //
        // The Alias creation pane covers it identically, and is declined for the
        // same reason rather than closed: an unfinished creation state is the
        // author's, and a keypress that landed behind the pane is not a request
        // to discard it. Opening anyway used to leave `creatingAlias` set while
        // the pane hid itself on `openedCardId`, so closing the Card brought a
        // surface back that the author had never returned to.
        if (openedCardId !== null || creatingAlias) return;
        const cardId = uuidSchema.safeParse(cardIdInput);
        if (cardId.success && editableCardIds.has(cardId.data)) openCard(cardId.data);
      },
      [openCard, editableCardIds, openedCardId, creatingAlias],
    );

    const openedCard = openedCardId ? rendererSpace.lookup.card(openedCardId) : undefined;
    const completeOpenedCard = useCallback((completed: ResolvedContentCard) => {
      const { id, ...document } = completed;
      const result = authoring.complete({ kind: 'edited-card', cardId: id, document });
      return result.kind === 'refused' ? result.refusal : null;
    }, []);

    /**
     * Every Card an Alias may name.
     *
     * The single-hop rule read forwards (ADR 0009): a Target must own its
     * content, so an Alias never appears — including the one being retargeted,
     * which is what stops a chain from being offered rather than refused. The
     * Space's own Cards, not the Layout's: an Alias points at content, and
     * content is not a thing a Layout owns.
     */
    const aliasTargets = useMemo(
      () => rendererSpace.cards.filter((card) => card.kind !== 'alias'),
      [rendererSpace],
    );
    // Scans every title in the Space, so it must not re-run on every drag
    // frame — `projection` (and this component) re-renders on each
    // intermediate drag position, but `sessionState.working` only changes on
    // a completed Edit.
    const newCardTitle = useMemo(() => nextCardTitle(sessionState.working), [sessionState.working]);
    /**
     * Authoring the Alias itself — one ordinary Card Edit, on whichever of its
     * two fields the author touched, and the operation package 3 already built
     * for both. Everything the change does not name rides through in the stored
     * document: the Alias keeps its id, its positions and its incident Edges.
     *
     * One helper rather than two, because a rename and a retarget differ only in
     * which key the change carries. Their *subjects* are what has to stay apart,
     * and that separation is the pane's: these fields write to the Alias, the
     * ones under them write to the Card that owns its content.
     */
    const editAlias = useCallback(
      (
        alias: Extract<Card, { kind: 'alias' }>,
        change: { readonly title: string; readonly target: CardId },
      ) => {
        const { id, ...document } = alias;
        const result = authoring.complete({
          kind: 'edited-card',
          cardId: id,
          document: { ...document, ...change },
        });
        return result.kind === 'refused' ? result.refusal : null;
      },
      [],
    );

    /**
     * Closing an opened Card returns focus to that Card.
     *
     * The pane cannot do this itself. The obvious target is the control that
     * opened it, and opening destroys that control — `titleEditingEnabled` goes
     * false while a Card is open, so every Card affordance is withdrawn — which
     * left a closed dialog dropping focus on `<body>`. The Card survives, is
     * focusable outside presenting, and is where the author was.
     *
     * Runs after the pane has unmounted and the graph has re-rendered, so the
     * node is back in the tree by the time it is asked for. Presenting is
     * excluded because it closes the opened Card on its way in and takes the
     * nodes out of the tab order behind it.
     */
    const lastOpenedCardId = useRef<string | null>(null);
    useEffect(() => {
      const closed = lastOpenedCardId.current;
      lastOpenedCardId.current = openedCardId;
      if (closed === null || openedCardId !== null || presenting) return;
      document
        .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(closed)}"]`)
        ?.focus();
    }, [openedCardId, presenting]);

    // An opened Card covers the graph and owns its own keys, so the global
    // Traversal commands are bound only while a traversal is the thing on screen.
    usePresentingKeys(presenting && openedCardId === null, {
      advance,
      retreat,
      selectBranch,
      exitPresenting,
    });

    const sidebar = (
      <WorkspaceSidebar
        workspaceTitle={rendererSpace.title}
        canvas={{ renderers, current, onSelect: selectCanvasRenderer }}
        graph={{
          graphs: projection.visibleGraphs,
          activeGraphId,
          colorByGraphId: projection.colors,
          onActivate: activateGraph,
          onPresent: present,
          presenting,
          onExitPresenting: exitPresenting,
        }}
        addCard={{
          onAddCard: addCard,
          onAddAlias: () => setCreatingAlias(true),
          disabled: !editable || presenting || openedCardId !== null || creatingAlias,
          keyShortcut: ADD_CARD_KEY,
          menuTriggerRef: addCardMenu,
        }}
        persistence={{
          control: (
            <PersistenceControl
              persistence={sessionState.persistence}
              onAcceptRemote={authoring.acceptStoredSpace}
              onKeepLocal={authoring.keepLocalWork}
            />
          ),
          state: sessionState.persistence.kind,
          acknowledgedRevision: sessionState.acknowledgedRevision,
        }}
      />
    );

    return (
      <AppShell
        sidebar={sidebar}
        header={<SelectedCanvasRenderer renderer={current} />}
        notice={
          <PersistenceNotice
            persistence={sessionState.persistence}
            onRetry={authoring.retryPersistence}
          />
        }
      >
        <div className="graph-area" style={cardSizeVars}>
          {canvas.kind === 'failure' ? (
            <PlacementFailure error={canvas.error} />
          ) : canvas.kind === 'arrangement' ? (
            <ReactFlowProvider>
              {/* Inside the provider and outside the canvas: it reads React
                  Flow's viewport for controls that live in the toolbar and in
                  the panes over the graph, and it is deliberately not keyed by
                  the replacement epoch — the getter it reports describes the
                  viewport, which a replaced Space does not invalidate. */}
              <CanvasCentre report={reportVisibleCentre} />
              <SpaceCanvas
                // Keyed on the replacement epoch, so accepting the stored Space
                // takes the canvas's local editing state with it. The render
                // adapter already drops the projection and drag bookkeeping, but
                // an open title editor is the graph's own: it names a Card from
                // a Space that is gone, and its raised invalid guard would go on
                // swallowing clicks in the one that replaced it.
                key={authoringState.replacementEpoch}
                nodes={liveProjection?.nodes ?? []}
                edges={liveProjection?.edges ?? []}
                // Null while a replacement arrangement resolves. The canvas keeps
                // drawing the one on screen through that window — deliberately, so
                // a gesture is never interrupted — so a connection is reachable
                // with no fresh projection to hand over, and the store keeps its
                // live nodes rather than reconciling against nothing.
                projectedNodes={projected?.nodes ?? null}
                activeCardId={activeCardId}
                presenting={presenting}
                editable={editable}
                // Both panes cover the graph, so both withdraw everything on it.
                // The toolbar's Add Card already reads the pair; this read only
                // the opened Card, so `C` and the inline title editor stayed
                // live behind an open Alias creation pane.
                titleEditingEnabled={openedCardId === null && !creatingAlias}
                onNodesChange={changeNodes}
                onEdgesChange={changeEdges}
                edgeAuthoring={edgeAuthoring}
                selection={selection}
                onSelectCard={selectCard}
                onSelectEdge={selectEdge}
                subjectCards={renderer.subject.cards}
                newCardTitle={newCardTitle}
                onAddCard={addCard}
                nameOnCreation={createdCardId}
                onOpenCard={openCardForEditing}
                onCompleteCardTitle={completeCardTitle}
                editableCardIds={editableCardIds}
                graphs={projection.visibleGraphs}
                colorByGraphId={projection.colors}
                activeGraphId={activeGraphId}
                activeGraphCardIds={activeGraphCardIds}
              />
            </ReactFlowProvider>
          ) : (
            <PlacementPending />
          )}

          {presenting && (
            <PresentingChrome
              moves={moves}
              canRetreat={canRetreat(navigationState)}
              onSelectBranch={selectBranch}
              onAdvance={advance}
              onRetreat={retreat}
              onExit={exitPresenting}
            />
          )}

          {/* An Alias authors only its own metadata. Its Target must be opened
              explicitly to author shared content (ADR 0049). */}
          {openedCard &&
            (openedCard.kind === 'alias' ? (
              <OpenCard
                through={openedCard}
                graphColor={editorGraphColor}
                occurrence={{
                  targets: aliasTargets,
                  onEdit: (change: { title: string; target: CardId }) =>
                    editAlias(openedCard, change),
                }}
                onCancel={closeCard}
              />
            ) : (
              <OpenCard
                card={openedCard}
                graphColor={editorGraphColor}
                onComplete={completeOpenedCard}
                onCancel={closeCard}
              />
            ))}

          {creatingAlias && openedCardId === null && (
            <NewAlias
              targets={aliasTargets}
              refusal={aliasRefusal}
              onCreate={createAlias}
              onCancel={cancelAlias}
              onRefusalStale={clearAliasRefusal}
            />
          )}
        </div>
      </AppShell>
    );
  }

  // One composition for the lifetime of the opened Space. Accepting the stored
  // Space replaces the working state through Authoring rather than mounting a
  // second app over the same session, so nothing here is ever handed back;
  // `authoring.dispose` remains the seam that would release it if that changed.
  return App;
};
