import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  AppShell,
  DRAWER_WIDTH,
} from '@project/ui';
import { type CardId, type LayoutId, type LayoutPosition, type UUID } from '@project/core';
import type { ProductDestination } from '@project/http';
import { graphCardIds, Placement, positionedStrategy } from '@project/graph';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace } from './open-spaces';
import type { AuthoringRefusal } from './space-authoring';
import { selectedCardOf, type EdgeSubject } from './render-adapter';
import { canvasProjection } from './canvas-projection';
import { canvasContent } from './canvas-content';
import {
  describeAuthoringRefusal,
  describeSpaceCardRefusal,
  presentNewAliasRefusal,
  presentNewSpaceCardRefusal,
} from './authoring-refusal';
import { useCardCreation } from './card-creation-react';
import type { CardCreationInput, CardCreationOutcome, CardCreationSeams } from './card-creation';
import { useSpaceCardTargets } from './space-card-targets';
import { usePlacementRendering } from './placement-rendering';
import { cardSizeVars } from './card';
import { canRetreat } from './navigation';
import { copyLink } from './clipboard';
import { spaceEntityActions } from './entity-actions';
import { usePresentingKeys } from './presenting-keys';
import { nextCardTitle } from './titles';
import { layoutCards, resolveLayout } from './layout-resolution';
import type { DestinationOpening } from './destination-opening';
import { ADD_CARD_KEY, SpaceCanvas } from './components/SpaceCanvas';
import { CanvasCentre, type VisibleCentre } from './components/CanvasCentre';
import { renameReturn } from './continuation';
import { CanvasContinuation } from './components/CanvasContinuation';
import { ChromeContinuation } from './components/ChromeContinuation';
import { CardsDrawer } from './components/CardsDrawer';
import { NewAlias } from './components/NewAlias';
import { NewSpaceCard } from './components/NewSpaceCard';
import { PlacementFailure } from './components/PlacementFailure';
import { PlacementPending } from './components/PlacementPending';
import { PresentingChrome } from './components/PresentingChrome';
import { PersistenceControl, PersistenceNotice } from './components/PersistenceControl';
import {
  SelectedLayoutName,
  SpaceSidebar,
  type SpaceChromeTitleEdit,
} from './components/SpaceSidebar';

export const createApp = (
  { app: composition, session: spaceSession, spaceCards, initialization }: OpenSpace,
  browserLocation: BrowserLocation,
  opening?: DestinationOpening,
) => {
  const {
    readWorkingSpace,
    currentSpace,
    navigation,
    authoring,
    adapter: useRenderAdapter,
    continuation,
    edgeAuthoring,
  } = composition;
  const openingGraphId = opening?.graphId ?? null;
  const openingPresentationCardId = opening?.presentationCardId ?? null;
  if (openingGraphId !== null && openingPresentationCardId !== null) {
    navigation.openPresentation(
      navigation.getState().selectedLayoutId,
      openingGraphId,
      openingPresentationCardId,
    );
  } else if (openingGraphId !== null) {
    navigation.openGraph(navigation.getState().selectedLayoutId, openingGraphId);
  }

  function App() {
    const authoringState = useSyncExternalStore(authoring.subscribe, authoring.getState);
    const sessionState = authoringState.session;
    const navigationState = authoringState.navigation;
    const selectedLayoutId = navigationState.selectedLayoutId;
    /**
     * The two things the browser's location tells this component (ADR 0081).
     *
     * Read rather than owned: the location follows one Space, is answered by
     * `browser-location.ts`, and outlives any one mount. What is *not* here is
     * the position that module last synced to — publishing it would let this
     * decide about a position twice.
     */
    const { addressedCardId, destinationNotFound } = useSyncExternalStore(
      browserLocation.subscribe,
      browserLocation.getState,
    );
    // Keyed on the Layout as well as the Card: a deliberate move clears the
    // published selection, and moving between two Layouts that address
    // the *same* Card leaves `addressedCardId` untouched, so keying on the Card
    // alone would let React bail out and never restore it. Clearing on `null` is
    // the other half — an address that stops naming a Card must stop selecting
    // one, or the Sidebar keeps offering copy commands for a Card the URL has
    // left behind.
    useEffect(() => {
      const adapter = useRenderAdapter.getState();
      if (addressedCardId === null) {
        adapter.clearSelection();
        return;
      }
      adapter.selectCard(addressedCardId);
      // Centred and focused once its projection exists — the one member that
      // touches the camera, because a Card arrived at by URL is somewhere the
      // reader has never been. The wait is the canvas adapter's, which is what
      // replaced the component that polled the live projection for it.
      continuation.request({
        target: { kind: 'card', cardId: addressedCardId },
        select: false,
        then: 'reveal',
      });
    }, [addressedCardId, selectedLayoutId]);
    /**
     * Whether a Card's content edit is running, reported up by the canvas.
     *
     * Read by one control. Presenting draws the active Card's content *instead
     * of* the Card (`showActiveCardContent`), so a live editor cannot survive it
     * and the draft would go without one of ADR 0064's four exits being spent.
     * The two modal surfaces need nothing here: `CardPane` owns its own
     * modality, and the editor is still there when it closes.
     */
    const [editingCardBody, setEditingCardBody] = useState(false);
    const [editingCardTitle, setEditingCardTitle] = useState(false);
    const [createLayoutRefusal, setCreateLayoutRefusal] = useState<AuthoringRefusal | null>(null);
    const [layoutManagementRefusal, setLayoutManagementRefusal] = useState<AuthoringRefusal | null>(
      null,
    );
    const [clipboardFailure, setClipboardFailure] = useState<string | null>(null);
    /**
     * Copy one address, answering whether it reached the clipboard.
     *
     * The answer is what a menu item reports on. This was fire-and-forget past
     * a `then`, so the press and the outcome were two moments and the item
     * swapped its label at the first one — "Copied" over a link the browser had
     * refused, with the refusal rendering as an alert the reader might not even
     * be able to see (the Sidebar is a Sheet over that area on a phone).
     *
     * The clipboard half of Copy link, and only that. What a destination's URL
     * *is* belongs to the browser location (ADR 0081); what happens to it after
     * is this surface's.
     */
    const copyProductDestination = useCallback(
      async (destination: ProductDestination): Promise<boolean> => {
        setClipboardFailure(null);
        const failure = await copyLink(browserLocation.href(destination));
        setClipboardFailure(failure);
        return failure === null;
      },
      [],
    );
    const [cardsDrawerOpen, setCardsDrawerOpen] = useState(initialization === 'created-layout');
    const cardsDrag = useRef<{
      readonly cardId: CardId;
      readonly layoutId: LayoutId;
    } | null>(null);
    const renderedSpace = useMemo(
      () => readWorkingSpace(sessionState.working),
      [sessionState.working],
    );

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
    // The origin is unreachable in practice — the control is withdrawn until Cards
    // are on the canvas, and the reporter is mounted with them — but a created
    // Card must land *somewhere*, and a refusal would be the wrong answer to a
    // question about geometry.
    const centreAnchor = (): LayoutPosition => visibleCentre.current?.() ?? { x: 0, y: 0 };

    /**
     * Making an Alias: the Target choice *is* the creation (ADR 0009's storyboard).
     *
     * A refusal keeps the surface open with its reason, because the two the
     * creation can raise are about the Target the author just chose — it has
     * left the Space, or it is an Alias itself — and closing would take away the
     * field that answers them. Handed on whole rather than checked against that
     * pair first: the check was a string comparison ending in a `throw`, which
     * is a crash inside a React event callback for the one case it was written
     * to catch, and the pane places every refusal it is given.
     *
     * `queued` and `unchanged` are `none`. `queued` is an Edit that lands later
     * from the drain and cannot honour "the caret lands on the Alias that now
     * exists", so it must not take the pane with it either; `unchanged` this
     * operation cannot answer, because it mints or it refuses. Neither is
     * reachable from here today — named rather than trusted to stay that way.
     */
    const createAlias = useCallback(
      ({ target, title }: Extract<CardCreationInput, { kind: 'alias' }>): CardCreationOutcome => {
        const created = authoring.complete({
          kind: 'created-alias',
          target,
          // Exactly as typed, empty string included: an empty title is how
          // Authoring is told to take the Target's own.
          title,
          anchor: centreAnchor(),
        });
        if (created.kind === 'refused')
          return { kind: 'refused', errors: presentNewAliasRefusal(created.refusal) };
        // Each arm named rather than narrowed in one comparison, so the
        // compiler asks again the day a fifth joins the union.
        if (created.kind === 'queued') return { kind: 'none' };
        if (created.kind === 'unchanged') return { kind: 'none' };
        if (created.createdCardId === undefined) return { kind: 'none' };
        return { kind: 'created', cardId: created.createdCardId };
      },
      [],
    );

    /**
     * Making a Space Card: one coordinated Edit across Spaces (ADR 0076).
     *
     * There is no naming continuation. The lifecycle answers `completed` and
     * nothing else, so the created Card has no id to select from the result,
     * and it needs none: the title was typed on the pane before the Edit ran,
     * which is why this pane has a title field where Add Card has an inline
     * editor. So it continues the way a cancelled pane does, at Add Card,
     * rather than leaving focus on `<body>` when the modal unmounts.
     *
     * The Cards the Space held before the Edit are what recognise the one it
     * added: the Edit is atomic and installs every participant at once, so
     * exactly one Card can have appeared in this Space.
     */
    const createSpaceCard = useCallback(
      async ({
        targetSpaceId,
        title,
      }: Extract<CardCreationInput, { kind: 'space' }>): Promise<CardCreationOutcome> => {
        // Resolved here rather than closed over: the Layout a Space Card is added
        // to is the one drawing when the author confirms, and the pane has been
        // open across renders. `create` still refuses `layout-not-found` on its
        // own account, against the Layout the coordinated Edit actually sees.
        const resolved = resolveLayout(currentSpace(), navigation.getState().selectedLayoutId);
        const input = {
          containingSpaceId: currentSpace().id,
          layoutId: resolved.layout.id,
          title,
          position: centreAnchor(),
        };
        const before = new Set(spaceSession.getState().working.cards.map(({ id }) => id));
        const result = await (targetSpaceId === null
          ? spaceCards.create(input)
          : spaceCards.link({ ...input, targetSpaceId }));
        if (result.kind === 'refused')
          return { kind: 'refused', errors: presentNewSpaceCardRefusal(result.refusal) };
        const created = spaceSession.getState().working.cards.find(({ id }) => !before.has(id));
        if (created !== undefined) useRenderAdapter.getState().selectCard(created.id);
        // `null` rather than the Card just selected: there is nothing to
        // continue *at*, because the title was typed on the pane before the
        // Edit ran, so the author goes back to Add Card.
        return { kind: 'created', cardId: null };
      },
      [],
    );

    /**
     * The two ways the kinds differ, and the only two (`card-creation.ts`).
     *
     * An Alias filters the Space it is already holding, so its read is
     * synchronous and its Edit is over before anything could draw a disabled
     * control. A Space Card reads the repository and completes across Spaces,
     * so both of its seams answer a promise and the pane goes busy for the
     * second. Everything else about the two panes is one state machine.
     *
     * A failed listing is not an empty repository, and the list on its own
     * cannot tell the author which it was — "A new Space" alone reads as "there
     * are no others", and creating a duplicate of a Space they meant to
     * reference is the mistake that follows. Said with the refusal the
     * coordination itself uses for an unreadable repository, so one failure is
     * not worded two ways.
     */
    const cardCreationSeams = useMemo<CardCreationSeams>(
      () => ({
        readChoices: (kind) =>
          kind === 'alias'
            ? {
                choices: {
                  kind: 'alias',
                  // The single-hop rule read forwards (ADR 0009): a Target must
                  // own its Markdown content. The Space's own Cards, not the
                  // Layout's — an Alias points at content, and content is not a
                  // thing a Layout owns.
                  targets: currentSpace().cards.filter((card) => card.kind === 'markdown'),
                },
                listing: null,
              }
            : spaceCards.referenceableSpaces(currentSpace().id).then(
                (spaces) => ({
                  choices: { kind: 'space', targets: { kind: 'read', spaces } },
                  listing: null,
                }),
                () => ({
                  choices: { kind: 'space', targets: { kind: 'unreadable' } },
                  listing: presentNewSpaceCardRefusal({ code: 'persistence-read-failed' }),
                }),
              ),
        submit: (input) => (input.kind === 'alias' ? createAlias(input) : createSpaceCard(input)),
        reportBreak: (failure) => console.error('The Card creation failed', failure),
        continuation,
      }),
      [createAlias, createSpaceCard],
    );
    const cardCreation = useCardCreation(cardCreationSeams);
    const creationPane = cardCreation.state.pane;
    /**
     * A creation pane is open, whichever kind it is creating.
     *
     * The condition every surface outside the pane reads. Both are modal — a
     * focus trap and a backdrop over the whole graph area — so "one authoring
     * surface at a time" is one rule, and writing it as a disjunction at each
     * of its call sites is how a third kind would come to be withdrawn from
     * some of them.
     */
    const creatingCard = creationPane.status !== 'closed';
    // A refusal describes the attempt; a failed listing describes the list. The
    // pane draws whichever is current on one channel, and only the module knows
    // that a keystroke ends the first and not the second.
    const creationRefusal =
      creationPane.status === 'closed'
        ? null
        : creationPane.status === 'submitting'
          ? creationPane.listing
          : (creationPane.refusal ?? creationPane.listing);

    const selectedLayout = useMemo(
      () => resolveLayout(renderedSpace, selectedLayoutId),
      [renderedSpace, selectedLayoutId],
    );
    // The positioned strategy that draws this Layout, built where it is used:
    // its one consumer is the placement rendering below (ADR 0025, ADR 0041).
    const strategy = useMemo(
      () => positionedStrategy(Placement.fromLayout(selectedLayout.layout)),
      [selectedLayout],
    );
    // The Cards this Layout places. Memoized on the same two values the Layout
    // is: it is the sole dependency of Edge Authoring's Card-title map and its
    // endpoint choices, and a fresh array per render would rebuild both on every
    // intermediate drag frame — which is the identity churn
    // `edge-authoring-react.tsx` says its commands object must not have.
    const placedCards = useMemo(
      () => layoutCards(renderedSpace, selectedLayout.layout),
      [renderedSpace, selectedLayout],
    );
    // Everything the canvas draws, derived once from the Space and the Layout.
    // Memoized on those two alone: the interaction state below changes far more
    // often, and it is `project` that reads it rather than this.
    const projection = useMemo(
      () => canvasProjection(renderedSpace, selectedLayout),
      [renderedSpace, selectedLayout],
    );

    const { activeGraphId } = navigationState;
    const presenting = navigationState.mode === 'presenting';
    useEffect(() => {
      cardsDrag.current = null;
    }, [selectedLayoutId, presenting, authoringState.replacementEpoch]);
    // There is a Card to go back to only once a traversal has left its first, and only
    // presenting has Traversal history at all — the same narrowing the alias above already
    // makes, spent here on the value behind it rather than on the mode.
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
    // the selected Layout — only worked because every install happened to be
    // followed by an unrelated notification. This component already re-renders
    // on both stores, and a render-time read cannot be stale at the render that
    // uses it. `replacePlacement` keeps the map's identity when the value is
    // unchanged, so this does not defeat the memo below.
    const authoredPositions = authoring.authoredPlacement();
    const resizeDraft = useRenderAdapter((s) => s.resizeDraft);
    const selection = useRenderAdapter((s) => s.selection);
    const selectedCardId = selectedCardOf(selection);
    const selectedCard =
      selectedCardId === null ? undefined : renderedSpace.lookup.card(selectedCardId);

    const cardsOutsideSelectedLayout = useMemo(
      () =>
        renderedSpace.cards.filter(
          (card) => selectedLayout.layout.positions[card.id] === undefined,
        ),
      [selectedLayout, renderedSpace.cards],
    );
    // The one condition the toggle's `disabled` and the drawer's own open state
    // both read, so neither can drift from the other into an enabled control
    // over a drawer that will not open.
    const cardsDrawerAvailable = !presenting && !creatingCard;
    // Withdrawing the drawer *closes* it rather than hiding it behind a still-true
    // `cardsDrawerOpen`. Presenting and creating an Alias both pass through here,
    // and a drawer that reopened itself on the way back would take
    // focus with it — `Drawer.Popup` moves focus in on every open, so Stop would
    // land the reader in the Cards list instead of on the canvas they returned to.
    useEffect(() => {
      if (!cardsDrawerAvailable) setCardsDrawerOpen(false);
    }, [cardsDrawerAvailable]);
    // Reveals the drawer once per (Layout, address) rather than on every
    // dependency change: an unrelated edit elsewhere in the Space still
    // recomputes `cardsOutsideSelectedLayout` with a fresh array identity, and
    // re-running on that alone would reopen a drawer the reader just closed.
    // The Layout is part of the key, not just the Card id — a canonical Card
    // link addresses no Layout of its own, so the same Card can be
    // revealed once in one Layout and then adopt a different default Layout
    // that omits it, and that is a second reveal rather than a repeat.
    const revealedAddressRef = useRef<{
      readonly layoutId: LayoutId;
      readonly cardId: CardId;
    } | null>(null);
    useEffect(() => {
      if (addressedCardId === null) {
        // Only a real navigation clears the address — choosing a Layout,
        // activating a Graph, or restoring a destination that names no Card —
        // so leaving it is the reader moving on rather than the incidental
        // recomputation this guard absorbs. Arriving back at the same address
        // afterwards is a fresh reveal, not the repeat being suppressed.
        revealedAddressRef.current = null;
        return;
      }
      if (
        revealedAddressRef.current?.layoutId === selectedLayoutId &&
        revealedAddressRef.current.cardId === addressedCardId
      ) {
        return;
      }
      if (cardsOutsideSelectedLayout.some(({ id }) => id === addressedCardId)) {
        setCardsDrawerOpen(true);
      }
      revealedAddressRef.current = { layoutId: selectedLayoutId, cardId: addressedCardId };
    }, [addressedCardId, selectedLayoutId, cardsOutsideSelectedLayout]);
    const moved = useRenderAdapter((s) => s.moved);
    const placement = usePlacementRendering(
      projection.strategyGraph,
      strategy,
      resizeDraft?.placement ?? authoredPositions,
    );
    const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;

    // Nothing is worth projecting before a strategy resolves — every card would
    // sit at the origin — and `project` will not take a null `LayoutStrategyGraph`,
    // so this is the whole of that gate rather than a rule the sync effect
    // remembers.
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
    const cardResize = useRenderAdapter((s) => s.cardResize);
    // There are Cards on the canvas to interact with once placement resolves
    // and the store has taken it.
    const hasCardsOnCanvas = liveProjection !== null;
    const canvas = canvasContent(placement, hasCardsOnCanvas);
    const editable = hasCardsOnCanvas;
    // Both refusals are drawn under Add Layout and both are about the Layout
    // that was selected when they were refused — the Edit Add Layout would have
    // made, and the Rename or Delete on that row. Neither says anything about
    // the Layout the reader has moved to, so the move clears them together.
    useEffect(() => {
      setCreateLayoutRefusal(null);
      setLayoutManagementRefusal(null);
    }, [selectedLayoutId]);
    const [spaceChromeEdit, setSpaceChromeEdit] = useState<{
      readonly subject: NonNullable<SpaceChromeTitleEdit['subject']>;
      readonly draft: string;
      readonly error: string | null;
      readonly surface: 'sidebar' | 'header';
    } | null>(null);
    const chromeEditingDisabled =
      !editable || presenting || creatingCard || editingCardBody || editingCardTitle;
    const cardIsOpen = Object.values(selectedLayout.layout.positions).some(
      (at) => at?.open === true,
    );

    /**
     * Delete Card is withdrawn wherever Add Card is, and for one reason more.
     *
     * It is a whole-Space authoring action on the *selected* Card, so it reads
     * the conditions `addCard.disabled` reads and adds `editingCardTitle`: that
     * one names the selected Card, and destroying the subject of a live rename
     * is the edit answering itself. Withdrawing it while a Card is open is what
     * keeps the Layout's Open state from outliving the Card it names — nothing
     * clears it on a Delete, so every affordance reading that state would stay
     * withdrawn with no pane left to close.
     */
    const deleteCardAvailable =
      editable &&
      !presenting &&
      !cardIsOpen &&
      !creatingCard &&
      !editingCardBody &&
      !editingCardTitle &&
      spaceChromeEdit === null;

    useEffect(() => {
      if (chromeEditingDisabled) setSpaceChromeEdit(null);
    }, [chromeEditingDisabled]);

    // A replacement discards every open Interaction draft (ADR 0042), and this
    // one lives outside the canvas subtree `replacementEpoch` keys, so the
    // remount does not reach it. Separate from the guard above because that
    // guard reads only `chromeEditingDisabled`: listing the epoch beside it
    // re-ran an effect whose body could then do nothing, which is how the two
    // rules came to look like one.
    useEffect(() => {
      setSpaceChromeEdit(null);
    }, [authoringState.replacementEpoch]);

    const completeSpaceChromeTitle = useCallback(
      (subject: NonNullable<SpaceChromeTitleEdit['subject']>, title: string): string | null => {
        const result =
          subject.kind === 'layout'
            ? authoring.complete({ kind: 'renamed-layout', layoutId: subject.id, title })
            : authoring.complete({ kind: 'renamed-graph', graphId: subject.id, title });
        if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
        setSpaceChromeEdit(null);
        return null;
      },
      [],
    );

    const titleEdit: SpaceChromeTitleEdit = {
      subject: spaceChromeEdit?.subject ?? null,
      surface: spaceChromeEdit?.surface ?? null,
      draft: spaceChromeEdit?.draft ?? '',
      error: spaceChromeEdit?.error ?? null,
      disabled: chromeEditingDisabled,
      onBegin: (subject, title, surface) =>
        setSpaceChromeEdit({ subject, draft: title, error: null, surface }),
      onDraftChange: (draft) =>
        setSpaceChromeEdit((current) => (current === null ? null : { ...current, draft })),
      onErrorChange: (error) =>
        setSpaceChromeEdit((current) => (current === null ? null : { ...current, error })),
      onComplete: completeSpaceChromeTitle,
      onCancel: () => setSpaceChromeEdit(null),
      /**
       * Where a chrome rename returns the caret.
       *
       * The surface it was begun from decides, and both answers are addresses
       * rather than elements: the editor calls this from inside its own key
       * handler, before React has swapped the row's editing branch back, so
       * there is no focusable element to have held on to — which is what the
       * captured DOM closure on this state used to be, and why it needed the
       * `.closest('li')` walk it carried to its call site.
       */
      onReturnFocus: () => {
        if (spaceChromeEdit === null) return;
        continuation.request(renameReturn(spaceChromeEdit.surface, spaceChromeEdit.subject));
      },
    };

    /**
     * Whether a menu's Rename and Delete may be offered at all.
     *
     * Rename begins the very chrome title edit `chromeEditingDisabled`
     * withdraws — the effect above discards a draft begun against that
     * condition on the same render — so this reads that condition itself rather
     * than a second spelling of it that can fall behind. It once was one, and
     * what the copy dropped was `editable`: while placement is pending there is
     * no projected canvas, so Rename opened an editor the effect closed on the
     * same render and Delete Layout ran a real Edit against it. Delete Layout
     * goes with Rename rather than standing alone in a menu whose other item
     * cannot run.
     *
     * `spaceChromeEdit === null` is the term `chromeEditingDisabled` does not
     * carry: it is what stops a second Rename beginning over a live one.
     *
     * The copy commands are deliberately **not** behind it: an address is a
     * fact about the entity rather than an Edit, and nothing about a live
     * rename or a presentation makes one uncopyable.
     */
    const entityEditsAvailable = !chromeEditingDisabled && spaceChromeEdit === null;

    const entityActions = spaceEntityActions({
      spaceId: renderedSpace.id,
      spaceTitle: renderedSpace.title,
      onCopy: copyProductDestination,
      onRename: entityEditsAvailable
        ? (subject, title) => {
            setLayoutManagementRefusal(null);
            titleEdit.onBegin(subject, title, 'sidebar');
          }
        : null,
      onDeleteLayout: entityEditsAvailable
        ? (layoutId) => {
            const result = authoring.complete({ kind: 'deleted-layout', layoutId });
            setLayoutManagementRefusal(result.kind === 'refused' ? result.refusal : null);
            // Answered rather than swallowed, because the refusal set above is
            // rendered *in the Sidebar* — and below its breakpoint that is a
            // Sheet over the canvas. The Sidebar dismisses the Sheet on a menu
            // command that did what its label said, so a Delete that did not
            // has to say so or the alert it just armed goes off screen unread.
            return result.kind === 'completed';
          }
        : null,
    });

    /**
     * Choosing a Layout row, including the row already current.
     *
     * Two acts, and only one of them is this component's. Discarding the chrome
     * title draft belongs to whichever module owns that Interaction — it is not
     * a fact about the browser's location — so it stays at the call site, in
     * front of the choice.
     */
    const selectLayoutRow = useCallback((selection: LayoutId) => {
      setSpaceChromeEdit(null);
      browserLocation.chooseLayout(selection);
    }, []);

    const present = navigation.present;
    const advance = navigation.advance;
    const retreat = navigation.retreat;
    const exitPresenting = navigation.exitPresenting;
    const activateGraph = browserLocation.activateGraph;

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
      () => new Set(activeGraphId === null ? [] : graphCardIds(renderedSpace, activeGraphId)),
      [renderedSpace, activeGraphId],
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
     * The refusal goes back to the caller, and only the caller can place it.
     *
     * Both `added-card-to-layout` outcomes this can produce
     * (`card-already-in-layout`, `card-not-found`) mean the Card just left
     * `cardsOutsideSelectedLayout`, so the row the reader activated is already
     * gone. The drawer is still on screen though, and it is the surface that
     * asked — so it keeps the sentence, in the `Alert` above its list.
     *
     * `dropExistingCard` below discards the same string on purpose: a drop
     * ends on the canvas, and by then the drawer that named the Card may be
     * dismissed, leaving nowhere the sentence belongs.
     */
    const addExistingCard = useCallback(
      (cardId: CardId, anchor: LayoutPosition, focus: boolean): string | null => {
        const result = authoring.complete({ kind: 'added-card-to-layout', cardId, anchor });
        if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
        if (result.kind !== 'completed') return null;
        useRenderAdapter.getState().selectCard(cardId);
        // The Card is not drawn yet — the projection carrying this Edit arrives
        // a strategy later — so the continuation waits for it rather than this
        // component polling the live projection, which is what it used to do.
        if (focus) {
          continuation.request({
            target: { kind: 'card', cardId },
            select: false,
            then: 'focus',
          });
        }
        return null;
      },
      [],
    );

    const dropExistingCard = useCallback(
      (cardId: CardId, anchor: LayoutPosition): void => {
        const drag = cardsDrag.current;
        cardsDrag.current = null;
        if (drag?.cardId !== cardId || drag.layoutId !== selectedLayoutId) return;
        addExistingCard(cardId, anchor, false);
      },
      [addExistingCard, selectedLayoutId],
    );

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
     * The toolbar remains available for an empty authored Layout: it is the
     * zero-Card Space's way to create the first Card. Canvas-local authoring is
     * still gated on `editable`, because there is no projected node surface to
     * receive its shortcut until that first Card exists.
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
      // from it. Both are the one continuation, spent when the projection that
      // draws the Card arrives.
      continuation.request({
        target: { kind: 'card', cardId: created.createdCardId },
        select: true,
        then: 'rename',
      });
    }, []);

    /**
     * Presenting takes a creation pane away, creating nothing.
     *
     * Keyed on the fact rather than wrapped around the control, so a second way
     * into presenting cannot leave a pane open over a presentation. The one
     * thing it waits for is a coordinated Edit already in flight: the pane
     * withholds Cancel and Escape while one runs, because the Edit completes
     * whether or not the surface that began it is still mounted, and closing
     * here would make exactly that abandonment through a route the pane cannot
     * refuse. Presenting is reachable from under a modal pane in one way — Back
     * onto a presenting Card URL is a browser navigation, and `popstate` does
     * not consult a focus trap. The completion leaves `submitting`, which runs
     * this again and takes the pane away then.
     */
    useEffect(() => {
      if (presenting) cardCreation.withdraw();
    }, [presenting, cardCreation]);
    /**
     * A replacement takes a creation pane away too (ADR 0042).
     *
     * Reachable under the modal: a conflict draws its `AlertDialog` over
     * everything, so Accept stored Space is pressable with the pane up. The
     * pane's choices are read once per opening, so one left standing would go
     * on offering Cards from the Space that is gone and refuse every one of
     * them against a row still on screen.
     *
     * A transition read during render rather than an effect, the way
     * `canvas-card-authoring.ts` reads `nameOnCreation`: `cardCreation` is a
     * new object on every dispatch, so an effect would need either the epoch
     * alone as its dependency — the one `exhaustive-deps` suppression in the
     * repository — or the operations, which would close the pane the render
     * after it opened.
     */
    const [replacedAt, setReplacedAt] = useState(authoringState.replacementEpoch);
    if (replacedAt !== authoringState.replacementEpoch) {
      setReplacedAt(authoringState.replacementEpoch);
      cardCreation.discard();
    }
    /**
     * The Card whose inline Title editor a creation opens.
     *
     * `rename` reaches `CanvasCard` as a prop rather than through the module:
     * `@project/ui` owns that editor and depends only on `core`, so it cannot
     * import this — and it should not. A component refocusing its own control
     * after its own edit is genuine locality.
     */
    const pendingContinuation = useSyncExternalStore(
      continuation.subscribe,
      continuation.getState,
    ).pending;
    const nameOnCreation =
      pendingContinuation?.then === 'rename' && pendingContinuation.target.kind === 'card'
        ? pendingContinuation.target.cardId
        : null;

    // Scans every title in the Space, so it must not re-run on every drag
    // frame — `projection` (and this component) re-renders on each
    // intermediate drag position, but `sessionState.working` only changes on
    // a completed Edit.
    const newCardTitle = useMemo(() => nextCardTitle(sessionState.working), [sessionState.working]);
    // One read per set of referenced Spaces, shared by the canvas and the Cards
    // collection so a Space Card names the same Space wherever it is drawn.
    const readSpaceCardTarget = useCallback((spaceId: UUID) => spaceCards.target(spaceId), []);
    const spaceCardTargets = useSpaceCardTargets(renderedSpace.cards, readSpaceCardTarget);
    const spaceTitleById = useMemo(
      () => new Map([...spaceCardTargets].map(([id, target]) => [id, target.title])),
      [spaceCardTargets],
    );
    // Global Traversal commands are bound only while presenting.
    usePresentingKeys(presenting, {
      advance,
      retreat,
      selectBranch,
      exitPresenting,
    });

    const sidebar = (
      <SpaceSidebar
        spaceTitle={renderedSpace.title}
        canvas={{
          layouts: renderedSpace.layouts,
          selected: selectedLayout.layout,
          onSelect: selectLayoutRow,
        }}
        graph={{
          graphs: projection.visibleGraphs,
          activeGraphId,
          colorByGraphId: projection.colors,
          onActivate: activateGraph,
          onPresent: present,
          canPresent: !editingCardBody && spaceChromeEdit === null,
          presenting,
          onExitPresenting: exitPresenting,
        }}
        addCard={{
          onAddCard: addCard,
          onAddAlias: () => cardCreation.open('alias'),
          onAddSpaceCard: () => cardCreation.open('space'),
          // `editingCardBody` is here for the reason it is on `canPresent`
          // above, and it is the condition that makes this control agree with
          // the `C` shortcut answering the same operation on the canvas. Add
          // Card ends by putting a caret in the created Card's title editor, and
          // title editing is withdrawn while a content edit owns the keyboard
          // (ADR 0064) — so a live toolbar created a Card and then swallowed the
          // naming it exists to begin.
          disabled: presenting || creatingCard || editingCardBody || spaceChromeEdit !== null,
          keyShortcut: ADD_CARD_KEY,
          hidden: presenting,
        }}
        createLayout={{
          // Reads `editingCardTitle` for the reason `layoutActions` does, and
          // for one more that is this control's own. Creating a Layout selects
          // it, and the created Layout is empty — so the canvas re-derives with
          // no nodes and a Card mid-rename unmounts, taking the draft, the
          // reason it was refused and the caret with it. A valid draft would
          // have been committed by the blur this button's own mousedown causes
          // (ADR 0065), which is precisely why a refused one is the case worth
          // withdrawing for: it is re-focused rather than settled, and nothing
          // else stands between the click and the Card that holds it. Add Card
          // above omits the same condition deliberately — it *begins* a title
          // edit rather than outliving one.
          disabled:
            presenting ||
            creatingCard ||
            editingCardBody ||
            editingCardTitle ||
            spaceChromeEdit !== null,
          refusal: createLayoutRefusal ?? layoutManagementRefusal,
          onCreate: () => {
            const result = authoring.complete({ kind: 'created-layout' });
            setCreateLayoutRefusal(result.kind === 'refused' ? result.refusal : null);
            setLayoutManagementRefusal(null);
            if (result.kind === 'completed') setCardsDrawerOpen(true);
          },
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
        selectedCard={
          selectedCard === undefined
            ? undefined
            : {
                // Which of its addresses this Card has is `spaceEntityActions`'
                // to decide from the Layout it is handed, not this call site's:
                // a selected Card the Cards drawer revealed is not necessarily
                // placed by the drawing Layout, and `layout-card` resolves
                // against `layout.positions`.
                card: selectedCard,
                /**
                 * Two paths, because deleting a Space Card is a different Edit.
                 *
                 * An ordinary Card is removed from one Space, which is Space
                 * Authoring's. A Space Card owns its target's lifetime together
                 * with every other reference to it, so deleting one can delete
                 * that Space and every Space below it that nothing else
                 * references — one atomic Edit over coordinated per-Space
                 * sessions, which is the Space Card lifecycle's and not a
                 * single-Space update this seam could make (ADR 0074, ADR 0076).
                 * Space Authoring refuses it on its own account, so the choice
                 * is made here rather than discovered there.
                 */
                onDelete: deleteCardAvailable
                  ? selectedCard.kind === 'space'
                    ? async () => {
                        const result = await spaceCards.delete({
                          containingSpaceId: renderedSpace.id,
                          cardId: selectedCard.id,
                        });
                        return result.kind === 'refused'
                          ? describeSpaceCardRefusal(result.refusal)
                          : null;
                      }
                    : () => {
                        const result = authoring.complete({
                          kind: 'deleted-card',
                          cardId: selectedCard.id,
                        });
                        return result.kind === 'refused'
                          ? describeAuthoringRefusal(result.refusal)
                          : null;
                      }
                  : undefined,
              }
        }
        titleEdit={titleEdit}
        entityActions={entityActions}
      />
    );

    return (
      <AppShell
        sidebar={sidebar}
        // The drawer overlays the end edge of the main area, and the canvas, the
        // Graph key and a standing notice are all pinned to that same edge. The
        // shell yields exactly the panel's own width so the three stay beside it
        // rather than behind it — `DRAWER_WIDTH` is the one place that number is.
        insetEnd={cardsDrawerOpen ? DRAWER_WIDTH : undefined}
        header={
          <>
            <SelectedLayoutName layout={selectedLayout.layout} titleEdit={titleEdit} />
            {/* Trigger and panel are one component: only the trigger renders
                here, the drawer portalling its popup over the canvas. That is
                what stops the toggle's `disabled` and the surface it names from
                drifting apart — they are now the same `cardsDrawerAvailable`
                read in one place rather than two 850 lines apart. */}
            <CardsDrawer
              open={cardsDrawerOpen}
              onOpenChange={setCardsDrawerOpen}
              disabled={!cardsDrawerAvailable}
              cards={cardsOutsideSelectedLayout}
              allCards={renderedSpace.cards}
              spaceTitleById={spaceTitleById}
              onAdd={(card, activation) =>
                addExistingCard(card.id, centreAnchor(), activation === 'keyboard')
              }
              onDragStart={(cardId) => {
                cardsDrag.current = { cardId, layoutId: selectedLayoutId };
              }}
              onDragEnd={() => {
                cardsDrag.current = null;
              }}
              revealedCardId={addressedCardId}
            />
          </>
        }
        notice={
          <>
            {clipboardFailure === null ? null : (
              <Alert variant="destructive">
                <AlertIcon />
                <AlertTitle>Link not copied</AlertTitle>
                <AlertDescription>{clipboardFailure}</AlertDescription>
              </Alert>
            )}
            {destinationNotFound ? (
              <Alert variant="destructive">
                <AlertIcon />
                <AlertTitle>Destination not found</AlertTitle>
                <AlertDescription>
                  The requested address does not exist in this Space.
                </AlertDescription>
              </Alert>
            ) : null}
            <PersistenceNotice
              persistence={sessionState.persistence}
              onRetry={authoring.retryPersistence}
            />
          </>
        }
      >
        <ChromeContinuation continuation={continuation} />
        {/* One child, not a row: the Cards drawer portals over this rather than
            sitting beside it, so a toggle that says nothing about the Layout no
            longer re-flows the canvas and re-measures every Card on it. */}
        <div className="graph-area size-full min-w-0" style={cardSizeVars}>
          {canvas.kind === 'failure' ? (
            <PlacementFailure error={canvas.error} />
          ) : canvas.kind === 'cards' ? (
            <ReactFlowProvider>
              {/* Inside the provider and outside the canvas: it reads React
                  Flow's viewport for controls that live in the toolbar and in
                  the panes over the graph, and it is deliberately not keyed by
                  the replacement epoch — the getter it reports describes the
                  viewport, which a replaced Space does not invalidate. */}
              <CanvasCentre report={reportVisibleCentre} />
              {/* The canvas half of where an Edit continues. Inside the
                  provider because `reveal` moves the camera and because an Edge
                  subject becomes an element only through the projection React
                  Flow is drawing. Its chrome half is mounted at the root, since
                  this subtree is conditional on there being Cards at all. */}
              <CanvasContinuation
                continuation={continuation}
                edges={liveProjection?.edges ?? []}
                onSelectCard={selectCard}
                onSelectEdge={selectEdge}
              />
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
                // Null while a replacement placement resolves. The canvas keeps
                // drawing the Cards on screen through that window — deliberately, so
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
                titleEditingEnabled={!creatingCard && spaceChromeEdit === null}
                onNodesChange={changeNodes}
                onEdgesChange={changeEdges}
                edgeAuthoring={edgeAuthoring}
                selection={selection}
                onSelectCard={selectCard}
                onSelectEdge={selectEdge}
                placedCards={placedCards}
                newCardTitle={newCardTitle}
                onAddCard={addCard}
                onAddExistingCard={dropExistingCard}
                nameOnCreation={nameOnCreation}
                authoring={authoring}
                spaceSession={spaceSession}
                onBodyEditingChange={setEditingCardBody}
                onTitleEditingChange={setEditingCardTitle}
                cardResize={cardResize}
                graphs={projection.visibleGraphs}
                colorByGraphId={projection.colors}
                activeGraphId={activeGraphId}
                activeGraphCardIds={activeGraphCardIds}
                spaceCardTargets={spaceCardTargets}
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
              onCopyLink={() => {
                if (activeGraphId === null || activeCardId === null) return;
                // `void`: presenting chrome's Copy link is a plain button with
                // no label to swap, so it has nothing to do with the outcome
                // beyond the alert `copyProductDestination` already renders.
                void copyProductDestination({
                  kind: 'presentation',
                  spaceId: renderedSpace.id,
                  layoutId: selectedLayoutId,
                  graphId: activeGraphId,
                  cardId: activeCardId,
                });
              }}
            />
          )}

          {creationPane.status !== 'closed' && creationPane.choices.kind === 'alias' && (
            <NewAlias
              targets={creationPane.choices.targets}
              refusal={creationRefusal}
              onCreate={(target, title) => cardCreation.submit({ kind: 'alias', target, title })}
              onCancel={cardCreation.cancel}
              onRefusalStale={cardCreation.refusalStale}
            />
          )}

          {creationPane.status !== 'closed' && creationPane.choices.kind === 'space' && (
            <NewSpaceCard
              targets={creationPane.choices.targets}
              refusal={creationRefusal}
              busy={creationPane.status === 'submitting'}
              onCreate={(targetSpaceId, title) =>
                cardCreation.submit({ kind: 'space', targetSpaceId, title })
              }
              onCancel={cardCreation.cancel}
              onRefusalStale={cardCreation.refusalStale}
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
