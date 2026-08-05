import { describe, expect, it } from 'vitest';
import type { BuiltInViewId, Card, Layout, LayoutPosition, Route, UUID } from '@project/core';
// The whole module is internal: `loadSpace` is the one intake that runs it.
import { isValidGraph, validateReferences, type SpaceReferenceError } from '../src/validate';
import { alias, card, uuid } from './card-files';

const errorKinds = (errors: readonly SpaceReferenceError[]): string[] => errors.map((e) => e.kind);

// A mutable space-file shape: these tests deliberately construct broken graphs
// (which loadSpace would reject) and hand them straight to validateReferences.
function baseSpaceFile(): {
  title: string;
  cards: Card[];
  routes: Route[];
  layouts?: Layout[];
  defaultView?: BuiltInViewId | UUID;
} {
  return {
    title: 'Test',
    cards: [
      card(uuid('00000000-0000-4000-8000-000000000002')),
      card(uuid('00000000-0000-4000-8000-000000000003')),
    ],
    routes: [
      {
        id: uuid('00000000-0000-4000-8000-000000000004'),
        title: 'Main',
        edges: [
          {
            from: uuid('00000000-0000-4000-8000-000000000002'),
            to: uuid('00000000-0000-4000-8000-000000000003'),
          },
        ],
      },
    ],
  };
}

function layout(id: UUID, positions: Partial<Record<UUID, LayoutPosition>>): Layout {
  return { id, title: id, kind: 'positioned', positions };
}

describe('validateReferences', () => {
  it('reports no errors for a consistent space', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
    expect(isValidGraph(baseSpaceFile())).toBe(true);
  });

  it('accepts a valid single-hop alias to a markdown card', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias(
        uuid('00000000-0000-4000-8000-000000000007'),
        'A, again',
        uuid('00000000-0000-4000-8000-000000000002'),
      ),
    );
    expect(validateReferences(m)).toEqual([]);
  });

  it('detects an unresolved edge endpoint, naming which end it was', () => {
    const m = baseSpaceFile();
    m.routes[0]!.edges[0]!.to = uuid('00000000-0000-4000-8000-000000000098');
    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'unresolved-route-edge');
    expect(error?.ref).toBe(uuid('00000000-0000-4000-8000-000000000098'));
    expect(error?.message).toContain('as its to');
  });

  it('accepts a route that closes a cycle (ADR 0032)', () => {
    const m = baseSpaceFile();
    // A → B → A: presenting decides how to traverse the authored loop.
    m.routes[0]!.edges.push({
      from: uuid('00000000-0000-4000-8000-000000000003'),
      to: uuid('00000000-0000-4000-8000-000000000002'),
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('rejects an exact duplicate Edge within one Route', () => {
    const m = baseSpaceFile();
    m.routes[0]!.edges.push({ ...m.routes[0]!.edges[0]! });

    expect(validateReferences(m)).toContainEqual({
      kind: 'duplicate-route-edge',
      ref: '00000000-0000-4000-8000-000000000002 → 00000000-0000-4000-8000-000000000003',
      message:
        'Route "00000000-0000-4000-8000-000000000004" repeats edge 00000000-0000-4000-8000-000000000002 → 00000000-0000-4000-8000-000000000003 at index 1 (first at index 0)',
    });
  });

  it('accepts a self-edge', () => {
    const m = baseSpaceFile();
    m.routes[0]!.edges.push({
      from: uuid('00000000-0000-4000-8000-000000000003'),
      to: uuid('00000000-0000-4000-8000-000000000003'),
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a cycle in a disconnected component', () => {
    const m = baseSpaceFile();
    m.cards.push(
      card(uuid('00000000-0000-4000-8000-000000000005')),
      card(uuid('00000000-0000-4000-8000-000000000006')),
    );
    m.routes[0]!.edges.push(
      {
        from: uuid('00000000-0000-4000-8000-000000000005'),
        to: uuid('00000000-0000-4000-8000-000000000006'),
      },
      {
        from: uuid('00000000-0000-4000-8000-000000000006'),
        to: uuid('00000000-0000-4000-8000-000000000005'),
      },
    );
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a fork and a merge', () => {
    const m = baseSpaceFile();
    m.cards.push(
      card(uuid('00000000-0000-4000-8000-000000000005')),
      card(uuid('00000000-0000-4000-8000-000000000006')),
    );
    // a forks to b and c, which merge back into d. `d` is reachable two ways,
    // which is exactly what a merge is.
    m.routes[0]!.edges = [
      {
        from: uuid('00000000-0000-4000-8000-000000000002'),
        to: uuid('00000000-0000-4000-8000-000000000003'),
      },
      {
        from: uuid('00000000-0000-4000-8000-000000000002'),
        to: uuid('00000000-0000-4000-8000-000000000005'),
      },
      {
        from: uuid('00000000-0000-4000-8000-000000000003'),
        to: uuid('00000000-0000-4000-8000-000000000006'),
      },
      {
        from: uuid('00000000-0000-4000-8000-000000000005'),
        to: uuid('00000000-0000-4000-8000-000000000006'),
      },
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('allows the same Edge in different Routes', () => {
    const m = baseSpaceFile();
    m.routes.push({
      id: uuid('00000000-0000-4000-8000-000000000030'),
      title: 'Alt',
      edges: [
        {
          from: uuid('00000000-0000-4000-8000-000000000002'),
          to: uuid('00000000-0000-4000-8000-000000000003'),
        },
      ],
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('allows two routes to disagree about order', () => {
    // main goes a → b and alt goes b → a. Their union has a cycle, which a
    // renderer must tolerate (ADR 0032).
    const m = baseSpaceFile();
    m.routes.push({
      id: uuid('00000000-0000-4000-8000-000000000030'),
      title: 'Alt',
      edges: [
        {
          from: uuid('00000000-0000-4000-8000-000000000003'),
          to: uuid('00000000-0000-4000-8000-000000000002'),
        },
      ],
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('detects duplicate card ids', () => {
    const m = baseSpaceFile();
    m.cards.push(card(uuid('00000000-0000-4000-8000-000000000002'), 'A dup'));
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'duplicate-card-id' && e.ref === uuid('00000000-0000-4000-8000-000000000002'),
      ),
    ).toBe(true);
  });

  it('reports an alias whose target resolves to no card', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias(
        uuid('00000000-0000-4000-8000-000000000099'),
        'Ghost',
        uuid('00000000-0000-4000-8000-000000000098'),
      ),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'unresolved-alias-target' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000098'),
      ),
    ).toBe(true);
  });

  it('reports an alias that points at itself', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias('00000000-0000-4000-8000-000000000010', 'Loop', '00000000-0000-4000-8000-000000000010'),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'alias-self-reference' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000010'),
      ),
    ).toBe(true);
  });

  it('reports an alias whose target is itself an alias (chains are single-hop)', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias(
        '00000000-0000-4000-8000-000000000010',
        'First',
        '00000000-0000-4000-8000-000000000002',
      ),
    );
    m.cards.push(
      alias(
        '00000000-0000-4000-8000-000000000011',
        'Second',
        '00000000-0000-4000-8000-000000000010',
      ),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'alias-targets-alias' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000010'),
      ),
    ).toBe(true);
  });
});

describe('validateReferences: layouts (ADR 0025)', () => {
  it('accepts a space that declares no layouts at all', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
  });

  it('accepts a layout that positions every card', () => {
    const m = baseSpaceFile();
    m.layouts = [
      layout(uuid('00000000-0000-4000-8000-000000000022'), {
        [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 },
        [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0 },
      }),
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a layout that omits cards — positions are sparse by design', () => {
    const m = baseSpaceFile();
    m.layouts = [
      layout(uuid('00000000-0000-4000-8000-000000000022'), {
        [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 },
      }),
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports a position naming a card that does not exist', () => {
    // The dangling position a deleted card leaves behind. Omitting a card is
    // fine; naming one that is gone is not — the asymmetry is the whole rule.
    const m = baseSpaceFile();
    m.layouts = [
      layout(uuid('00000000-0000-4000-8000-000000000022'), {
        [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 },
        [uuid('00000000-0000-4000-8000-000000000099')]: { x: 10, y: 10 },
      }),
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-position-unknown-card' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('reports duplicate layout ids, which an index would silently collapse', () => {
    const m = baseSpaceFile();
    m.layouts = [
      layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
      layout(uuid('00000000-0000-4000-8000-000000000022'), {
        [uuid('00000000-0000-4000-8000-000000000002')]: { x: 1, y: 1 },
      }),
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'duplicate-layout-id' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000022'),
      ),
    ).toBe(true);
  });

  it('accepts a defaultView naming a declared layout', () => {
    const m = baseSpaceFile();
    m.layouts = [layout(uuid('00000000-0000-4000-8000-000000000022'), {})];
    m.defaultView = uuid('00000000-0000-4000-8000-000000000022');
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a defaultView naming a built-in automatic view', () => {
    for (const view of ['graph', 'grid'] as const) {
      const m = baseSpaceFile();
      m.defaultView = view;
      expect(validateReferences(m)).toEqual([]);
    }
  });

  it('reports a defaultView naming neither a layout nor a built-in', () => {
    const m = baseSpaceFile();
    m.layouts = [layout(uuid('00000000-0000-4000-8000-000000000022'), {})];
    m.defaultView = uuid('00000000-0000-4000-8000-000000000099');
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'unresolved-default-view' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
    expect(isValidGraph(m)).toBe(false);
  });
});

describe('validateReferences: the routes a Layout names (ADR 0026)', () => {
  /** Two routes, so a filter has something to leave out. */
  function twoRoutes() {
    const m = baseSpaceFile();
    m.routes.push({
      id: uuid('00000000-0000-4000-8000-000000000020'),
      title: 'Aside',
      edges: [
        {
          from: uuid('00000000-0000-4000-8000-000000000003'),
          to: uuid('00000000-0000-4000-8000-000000000002'),
        },
      ],
    });
    return m;
  }

  it('accepts a layout that names neither — every route shown, the first active', () => {
    const m = twoRoutes();
    m.layouts = [layout(uuid('00000000-0000-4000-8000-000000000022'), {})];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a filter and an active route inside it', () => {
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        routes: [uuid('00000000-0000-4000-8000-000000000004')],
        activeRoute: uuid('00000000-0000-4000-8000-000000000004'),
      },
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts an active route with no filter — every route is visible', () => {
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        activeRoute: uuid('00000000-0000-4000-8000-000000000020'),
      },
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports a filter naming a route the space does not have', () => {
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        routes: [
          uuid('00000000-0000-4000-8000-000000000004'),
          uuid('00000000-0000-4000-8000-000000000099'),
        ],
      },
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-unknown-route' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
    expect(isValidGraph(m)).toBe(false);
  });

  it('reports an activeRoute the space does not have', () => {
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        activeRoute: uuid('00000000-0000-4000-8000-000000000099'),
      },
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-unknown-route' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('reports an activeRoute the layout filters out, though both ids resolve', () => {
    // The one check that relates the two fields rather than resolving either
    // against the space. Activating moves emphasis within the visible set, so a
    // layout opening active on a route it hides has asked for an unreachable
    // state — and it is an error even though "aside" is a perfectly real route.
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        routes: [uuid('00000000-0000-4000-8000-000000000004')],
        activeRoute: uuid('00000000-0000-4000-8000-000000000020'),
      },
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-active-route-not-shown' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000020'),
      ),
    ).toBe(true);
    // Not also reported as unknown: it resolves, it is just not shown.
    expect(errorKinds(errors)).not.toContain('layout-unknown-route');
  });

  it('reports an empty filter with an active route, rather than treating it as absent', () => {
    // A layout showing no routes is legal shape; naming an active one is not,
    // because the visible set it must belong to is empty. Absent means all —
    // empty means none, and the two must not collapse.
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        routes: [],
        activeRoute: uuid('00000000-0000-4000-8000-000000000004'),
      },
    ];
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-active-route-not-shown' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000004'),
      ),
    ).toBe(true);
  });

  it('names the layout in the message, since the id alone does not say where', () => {
    const m = twoRoutes();
    m.layouts = [
      {
        ...layout(uuid('00000000-0000-4000-8000-000000000022'), {}),
        routes: [uuid('00000000-0000-4000-8000-000000000099')],
      },
    ];
    const [error] = validateReferences(m);
    expect(error?.message).toContain('"00000000-0000-4000-8000-000000000022"');
  });
});
