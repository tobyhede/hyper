import {
  titleName,
  type DiagramPosition,
  type SpaceSnapshot,
  type ThingDocument,
  type UUID,
} from '@project/core';
import { Placement } from './placement';

/**
 * The Thing membership rules that turn a Space snapshot into the next one when
 * a Thing joins, grows, shrinks or leaves a Diagram — Add, Open, Close, Resize,
 * Remove from Diagram, Delete from Space (ADR 0084, ADR 0086).
 *
 * `SnapshotEdit` operates on `SpaceSnapshot` — the one representation both
 * Space Authoring and the session registry already hold — rather than the
 * loaded `Space` (the registry would have to parse every snapshot to edit it)
 * or a bare `Placement` (a caller would keep assembling snapshots around it,
 * which is where the registry's copy of these rules diverged from Authoring's:
 * `session-registry.ts`'s own `removeSpaceThing` never called
 * {@link Placement.reclaim}, so an Open Space Thing's room stayed displaced
 * after it was deleted, and `addSpaceThing` never stepped off an occupied
 * point the way a menu-created Markdown Thing does).
 *
 * Every operation answers `completed(snapshot) | unchanged | refused(code)`,
 * never a throw for a domain rule (ADR 0057). This module declares its own
 * small refusal union carrying codes and typed context only — wording stays in
 * `app`, which maps a code into `AuthoringRefusal` or `SpaceThingRefusal`.
 *
 * Operations arrive with their first real caller rather than ahead of one:
 * `createInDiagram` and `deleteFromSpace` are what the session registry needs
 * (ticket 01); Space Authoring's own Open, Close, Resize and Remove from
 * Diagram stay where they are until ticket 03 routes them through here too.
 */

/** Why a `SnapshotEdit` operation refused, with the typed context a sentence needs. */
export type SnapshotEditRefusal =
  | { readonly code: 'thing-not-found' }
  | { readonly code: 'diagram-not-found' }
  | {
      readonly code: 'thing-has-aliases';
      /** The Aliases by **name**, which is what a sentence listing Things says (ADR 0083). */
      readonly aliasTitles: readonly string[];
    };

/** What a `SnapshotEdit` operation answers. */
export type SnapshotEditOutcome =
  | { readonly kind: 'completed'; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SnapshotEditRefusal };

/**
 * How far a Thing creation steps when the point it was given is already taken,
 * and in which direction.
 *
 * Moved here from Space Authoring's own `freeAnchor`
 * (`packages/app/src/space-authoring.ts`), because the registry has to place a
 * menu-created Space Thing exactly as a menu-created Markdown Thing lands
 * (ADR 0089) and a rule with two owners had none — the registry wrote the
 * anchor it was given exactly, so a repeated centre-add stacked Space Things
 * on top of each other. Authoring keeps its own copy until ticket 03 routes it
 * through this module too.
 *
 * A visible stack rather than collision avoidance: existing Things never move,
 * and partial overlap of the Front is deliberate. Only an *exact* anchor
 * collision steps, which is what a repeated centre-add produces and a pointer
 * drop essentially never does.
 */
const STACK_STEP = 24;

const freeAnchor = (placement: Placement, anchor: DiagramPosition): DiagramPosition => {
  const taken = new Set([...placement.values()].map(({ x, y }) => `${x},${y}`));
  let at = anchor;
  // Terminates: each step is a distinct point on one diagonal, and the taken
  // set is finite, so at most one step per placed Thing can be occupied.
  for (let step = 1; taken.has(`${at.x},${at.y}`); step += 1) {
    at = { x: anchor.x + STACK_STEP * step, y: anchor.y + STACK_STEP * step };
  }
  return at;
};

/**
 * Add a new Thing to a Space, positioned closed in one named Diagram.
 *
 * The caller mints the Thing's id and document — this only places it. Refuses
 * `diagram-not-found` for a Diagram this snapshot does not name, changing
 * nothing, rather than the silence `addSpaceThing` used to answer with — a
 * Thing added to the Space but positioned nowhere, which is what let a
 * coordinated create or link report `completed` after its containing Diagram
 * went during a wait (`.scratch/snapshot-edits/issues/05-creation-decides-after-its-last-wait.md`).
 * A freshly minted id is otherwise never already a member of anything, so a
 * found Diagram always completes.
 *
 * `avoidingOverlap` steps diagonally off a point another Thing in the named
 * Diagram already occupies exactly, exactly as a menu-created Markdown Thing
 * lands (ADR 0089, {@link freeAnchor}). `exact` keeps the aimed point, for a
 * caller with one to aim — create-and-connect's drop point, which does not
 * reach this module yet (ticket 03).
 */
function createInDiagram(
  snapshot: SpaceSnapshot,
  diagramId: UUID,
  thingId: UUID,
  document: ThingDocument,
  position: DiagramPosition,
  mode: 'exact' | 'avoidingOverlap',
): SnapshotEditOutcome {
  const diagrams = snapshot.document.diagrams ?? [];
  const target = diagrams.find((diagram) => diagram.id === diagramId);
  if (target === undefined) {
    return { kind: 'refused', refusal: { code: 'diagram-not-found' } };
  }
  const at =
    mode === 'avoidingOverlap' ? freeAnchor(Placement.fromDiagram(target), position) : position;
  return {
    kind: 'completed',
    snapshot: {
      ...snapshot,
      things: [...snapshot.things, { id: thingId, document }],
      document: {
        ...snapshot.document,
        diagrams: diagrams.map((diagram) =>
          diagram.id === diagramId
            ? {
                ...diagram,
                positions: { ...diagram.positions, [thingId]: { ...at, open: false } },
              }
            : diagram,
        ),
      },
    },
  };
}

/**
 * Remove a Thing from a Space entirely: its own entry, its position and every
 * Edge incident to it in **every** Diagram, with the room it held given back
 * wherever it was Open (ADR 0084).
 *
 * Kind-agnostic — deleting a Space Thing this way is exactly this, and the
 * cross-Space cascade that follows (deleting a target Space nothing
 * references any more) is the registry's own next step, not this operation's.
 * `defaultDiagram`, `activeGraph` and every title are untouched.
 *
 * Refuses `thing-not-found` for an id the Space does not hold, and
 * `thing-has-aliases` — naming every Alias by title — for a Thing an Alias in
 * this Space still targets: an Alias whose Target vanished is not a Thing
 * intake accepts (ADR 0070), so the Space must not lose one out from under its
 * Aliases. Space Thing deletion used to skip this guard entirely and reach
 * intake instead, which answered the generic `aggregate-refused` — nothing
 * committed, but nothing useful said either.
 */
function deleteFromSpace(snapshot: SpaceSnapshot, thingId: UUID): SnapshotEditOutcome {
  if (!snapshot.things.some((thing) => thing.id === thingId)) {
    return { kind: 'refused', refusal: { code: 'thing-not-found' } };
  }
  const incoming = snapshot.things.filter(
    (thing) => thing.document.kind === 'alias' && thing.document.target === thingId,
  );
  if (incoming.length > 0) {
    return {
      kind: 'refused',
      refusal: {
        code: 'thing-has-aliases',
        aliasTitles: incoming.map((alias) => titleName(alias.document.title)),
      },
    };
  }
  const diagrams = snapshot.document.diagrams ?? [];
  return {
    kind: 'completed',
    snapshot: {
      ...snapshot,
      things: snapshot.things.filter((thing) => thing.id !== thingId),
      document: {
        ...snapshot.document,
        diagrams: diagrams.map((diagram) => ({
          ...diagram,
          positions: Placement.toPositions(
            Placement.remove(Placement.reclaim(Placement.fromDiagram(diagram), thingId), thingId),
          ),
          graphs: diagram.graphs.map((graph) => ({
            ...graph,
            edges: graph.edges.filter((edge) => edge.from !== thingId && edge.to !== thingId),
          })),
        })),
      },
    },
  };
}

export const SnapshotEdit = {
  createInDiagram,
  deleteFromSpace,
} as const;
