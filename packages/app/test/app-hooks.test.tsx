import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type MapId, type Resource, type ResourceId, type UUID } from '@project/core';
import type { SpaceSessionState, SpaceSummary } from '@project/persistence';
import { useAddressedResource } from '../src/addressed-resource';
import { authoringAvailability } from '../src/authoring-availability';
import type { BrowserLocationState } from '../src/browser-location';
import { useCanvasRendering } from '../src/canvas-rendering';
import { CLIPBOARD_REFUSAL } from '../src/clipboard';
import { useDockChrome, type DockChromeInput } from '../src/dock-chrome';
import { useUnsettledLeaveGuard } from '../src/leave-guard';
import { mapView, useMapView } from '../src/map-view';
import { useNameOnCreation } from '../src/name-on-creation';
import type { OpenSpace } from '../src/open-spaces';
import { useOpenSpacesStanding } from '../src/open-spaces-context';
import { useReferenceableSpaces } from '../src/referenceable-spaces';
import { useResourcePlacement } from '../src/resource-placement';
import { useResourceRailActions } from '../src/resource-rail-actions';
import { useResourcesDisclosure } from '../src/resources-disclosure';
import { useSpaceAddresses } from '../src/space-addresses';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import { useSpaceResourceTargetTitles } from '../src/space-resource-targets';
import { useAuthoringAvailability, type AuthoringFacts } from '../src/use-authoring-availability';
import { useVisibleCentre } from '../src/visible-centre';
import {
  GRAPH_ID,
  MAP_ID,
  OTHER_MAP_ID,
  OUTSIDE,
  PLACED_A,
  SPACE_ID,
  derivationSpace,
  openDerivationSpace,
} from './app-derivation-fixtures';
import { mintingIds } from './minting';

/**
 * The hooks `App` composes, each driven on its own.
 *
 * Collaborators are the real composition where the hook spends one, and a
 * narrow stand-in where the hook's interface is narrow.
 */

const CREATED = uuidSchema.parse('00000000-0000-4000-8000-0000000000c1');
const TARGET_SPACE = uuidSchema.parse('00000000-0000-4000-8000-0000000000d1');

/** An observable value, as the stores these hooks subscribe to publish one. */
const observable = <State,>(initial: State) => {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (next: State) => {
      state = next;
      for (const listener of listeners) listener();
    },
  };
};

/** The fixture's drawn Map. */
const drawnMap = () => {
  const resolved = derivationSpace().lookup.map(MAP_ID);
  if (resolved === undefined) throw new Error('The fixture has no drawn Map.');
  return resolved.map;
};

const placedIds = (opened: OpenSpace, mapId: MapId = MAP_ID): readonly string[] =>
  Object.keys(
    opened.session.getState().working.document.maps?.find(({ id }) => id === mapId)?.positions ??
      {},
  );

describe('useOpenSpacesStanding', () => {
  it('reads an isolated mount as the Space on the canvas, with no open set', () => {
    const { result } = renderHook(() => useOpenSpacesStanding(SPACE_ID));
    expect(result.current).toEqual({ spaces: null, active: true });
  });
});

describe('useAddressedResource', () => {
  const recording = () => {
    const calls: string[] = [];
    return {
      calls,
      selection: {
        getState: () => ({
          selectResource: (id: ResourceId) => calls.push(`select ${id}`),
          clearSelection: () => calls.push('clear'),
        }),
      },
      continuation: {
        request: ({ then }: { readonly then: string }) => calls.push(`continue ${then}`),
      },
    };
  };

  it('selects and reveals the addressed Resource, and clears once the address leaves it', () => {
    const location = observable<BrowserLocationState>({
      addressedResourceId: PLACED_A,
      destinationNotFound: false,
    });
    const { calls, selection, continuation } = recording();
    const { result } = renderHook(() =>
      useAddressedResource(location, selection, continuation, MAP_ID),
    );

    expect(result.current.addressedResourceId).toBe(PLACED_A);
    expect(calls).toEqual([`select ${PLACED_A}`, 'continue reveal']);

    act(() => location.publish({ addressedResourceId: null, destinationNotFound: true }));
    expect(result.current).toEqual({ addressedResourceId: null, destinationNotFound: true });
    expect(calls.at(-1)).toBe('clear');
  });

  it('selects the same Resource again on another Map', () => {
    const location = observable<BrowserLocationState>({
      addressedResourceId: PLACED_A,
      destinationNotFound: false,
    });
    const { calls, selection, continuation } = recording();
    const { rerender } = renderHook(
      ({ mapId }: { readonly mapId: MapId }) =>
        useAddressedResource(location, selection, continuation, mapId),
      { initialProps: { mapId: MAP_ID } },
    );
    rerender({ mapId: OTHER_MAP_ID });
    expect(calls.filter((call) => call === `select ${PLACED_A}`)).toHaveLength(2);
  });
});

describe('useMapView', () => {
  it('holds every identity still while the snapshot and the Map do', () => {
    const opened = openDerivationSpace();
    const working = opened.session.getState().working;
    const { result, rerender } = renderHook(
      ({ mapId }: { readonly mapId: MapId }) =>
        useMapView(opened.app.readWorkingSpace, working, mapId),
      { initialProps: { mapId: MAP_ID } },
    );
    const first = result.current;
    expect(first.newResourceTitle).toMatch(/^Resource \d+$/u);

    rerender({ mapId: MAP_ID });
    expect(result.current.renderedSpace).toBe(first.renderedSpace);
    expect(result.current.projection).toBe(first.projection);
    expect(result.current.mapPlacement).toBe(first.mapPlacement);
    expect(result.current.placedResources).toBe(first.placedResources);

    rerender({ mapId: OTHER_MAP_ID });
    expect(result.current.renderedSpace).toBe(first.renderedSpace);
    expect(result.current.selectedMap.map.id).toBe(OTHER_MAP_ID);
    expect(result.current.projection).not.toBe(first.projection);
  });
});

describe('useVisibleCentre', () => {
  it('anchors at the origin until the canvas reports its centre', () => {
    const { result } = renderHook(() => useVisibleCentre());
    expect(result.current.centreAnchor()).toEqual({ x: 0, y: 0 });

    act(() => result.current.reportVisibleCentre(() => ({ x: 5, y: 6 })));
    expect(result.current.centreAnchor()).toEqual({ x: 5, y: 6 });

    act(() => result.current.reportVisibleCentre(null));
    expect(result.current.centreAnchor()).toEqual({ x: 0, y: 0 });
  });
});

describe('useReferenceableSpaces', () => {
  const summaries: readonly SpaceSummary[] = [{ id: TARGET_SPACE, title: 'Elsewhere' }];
  const newerSummaries: readonly SpaceSummary[] = [{ id: CREATED, title: 'Newer' }];

  it('reads nothing while hidden, then once per epoch while shown', async () => {
    const spaceSet = observable(0);
    const referenceableSpaces = vi.fn((_containing: UUID) =>
      Promise.resolve(spaceSet.getState() === 0 ? summaries : newerSummaries),
    );
    const source = { spaceSet, referenceableSpaces };
    const reportBreak = vi.fn();
    const containingSpaceId = () => SPACE_ID;
    const { result, rerender } = renderHook(
      ({ active }: { readonly active: boolean }) =>
        useReferenceableSpaces(active, source, containingSpaceId, reportBreak),
      { initialProps: { active: false } },
    );
    expect(referenceableSpaces).not.toHaveBeenCalled();

    rerender({ active: true });
    await waitFor(() => expect(result.current).toEqual(summaries));
    expect(referenceableSpaces).toHaveBeenCalledWith(SPACE_ID);

    act(() => spaceSet.publish(0));
    expect(referenceableSpaces).toHaveBeenCalledTimes(1);
    await act(async () => {
      spaceSet.publish(1);
      await referenceableSpaces.mock.results[1]?.value;
    });
    expect(referenceableSpaces).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual(newerSummaries);
    expect(reportBreak).not.toHaveBeenCalled();
  });

  it('reports a failed read, answers an empty list, and reads no more while shown', async () => {
    const failure = new Error('unreachable');
    const source = {
      spaceSet: observable(0),
      referenceableSpaces: vi.fn((_containing: UUID) => Promise.reject(failure)),
    };
    const reportBreak = vi.fn();
    const containingSpaceId = () => SPACE_ID;
    const { result } = renderHook(() =>
      useReferenceableSpaces(true, source, containingSpaceId, reportBreak),
    );
    await waitFor(() => expect(reportBreak).toHaveBeenCalledWith(failure));
    expect(result.current).toEqual([]);
    expect(source.referenceableSpaces).toHaveBeenCalledTimes(1);
  });
});

describe('useResourcePlacement', () => {
  const place = (opened: OpenSpace) =>
    renderHook(
      ({ presenting }: { readonly presenting: boolean }) =>
        useResourcePlacement(opened, {
          map: drawnMap(),
          presenting,
          replacementEpoch: 0,
          reportBreak: () => undefined,
        }),
      { initialProps: { presenting: false } },
    );

  it('adds a Resource at the visible centre and continues in its Title', () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const { result } = place(opened);
    act(() => result.current.reportVisibleCentre(() => ({ x: 70, y: 80 })));

    act(() => result.current.addResource());

    expect(placedIds(opened)).toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });

  it('settles a drop from the Resources list by placing the dragged Resource', () => {
    const opened = openDerivationSpace();
    const { result } = place(opened);
    const settle = vi.fn();

    act(() => result.current.startResourceDrag(OUTSIDE, settle));
    act(() => result.current.dropExistingResource(OUTSIDE, { x: 1, y: 2 }));

    expect(settle).toHaveBeenCalledWith(null);
    expect(placedIds(opened)).toContain(OUTSIDE);
  });

  it('places nothing for a drop no drag started, or one presenting abandoned', () => {
    const opened = openDerivationSpace();
    const { result, rerender } = place(opened);
    const settle = vi.fn();

    act(() => result.current.dropExistingResource(OUTSIDE, { x: 1, y: 2 }));
    act(() => result.current.startResourceDrag(OUTSIDE, settle));
    rerender({ presenting: true });
    act(() => result.current.dropExistingResource(OUTSIDE, { x: 1, y: 2 }));

    expect(settle).not.toHaveBeenCalled();
    expect(placedIds(opened)).not.toContain(OUTSIDE);
  });
});

describe('useCanvasRendering', () => {
  it('lays the Map out and hands the projection to the render adapter', async () => {
    const opened = openDerivationSpace();
    const view = mapView(derivationSpace(), MAP_ID);
    const { result } = renderHook(() =>
      useCanvasRendering(opened.app.adapter, {
        projection: view.projection,
        mapPlacement: view.mapPlacement,
        activeGraphId: GRAPH_ID,
        activeResourceId: null,
        presenting: false,
      }),
    );
    expect(result.current.canvas.kind).toBe('placeholder');

    await waitFor(() => expect(result.current.hasResourcesOnCanvas).toBe(true));
    expect(result.current.canvas.kind).toBe('resources');
    expect(result.current.projected?.nodes.map(({ id }) => id)).toEqual(
      view.placedResources.map(({ id }) => id),
    );

    act(() => result.current.selectResource(PLACED_A));
    expect(result.current.selection).toEqual({ kind: 'resource', resourceId: PLACED_A });
  });
});

describe('useAuthoringAvailability', () => {
  const facts: AuthoringFacts = {
    editable: true,
    presenting: false,
    resourceIsOpen: false,
    spaceOnCanvas: true,
    editingEmbeddedMap: false,
    creatingSpaceResource: false,
  };
  const withheld = authoringAvailability({
    ...facts,
    editingResourceBody: false,
    editingResourceTitle: false,
    editingChromeTitle: true,
  });

  it('answers from the editing reports it holds', () => {
    const { result } = renderHook(() => useAuthoringAvailability(facts, 0));
    act(() => result.current.setEditingChromeTitle(true));
    expect(result.current.availability).toEqual(withheld);
  });

  it('ends a chrome rename on a replacement', () => {
    const { result, rerender } = renderHook(
      ({ epoch }: { readonly epoch: number }) => useAuthoringAvailability(facts, epoch),
      { initialProps: { epoch: 0 } },
    );
    act(() => result.current.setEditingChromeTitle(true));
    rerender({ epoch: 1 });
    expect(result.current.availability).not.toEqual(withheld);
    expect(result.current.availability.chromeTitleEdit).toBe(true);
  });

  it('ends a chrome rename that is no longer available', () => {
    const { result, rerender } = renderHook(
      ({ presenting }: { readonly presenting: boolean }) =>
        useAuthoringAvailability({ ...facts, presenting }, 0),
      { initialProps: { presenting: false } },
    );
    act(() => result.current.setEditingChromeTitle(true));
    rerender({ presenting: true });
    rerender({ presenting: false });
    expect(result.current.availability).not.toEqual(withheld);
  });
});

describe('useResourcesDisclosure', () => {
  const outside: readonly Resource[] = derivationSpace().resources.filter(
    ({ id }) => id === OUTSIDE,
  );

  it('asks once for an address the Map leaves out, and drops the ask when the list goes', () => {
    const { result, rerender } = renderHook(
      ({ available, resources }: { readonly available: boolean; resources: readonly Resource[] }) =>
        useResourcesDisclosure(available, {
          addressedResourceId: OUTSIDE,
          mapId: MAP_ID,
          resourcesOutsideMap: resources,
        }),
      { initialProps: { available: true, resources: outside } },
    );
    const asked = result.current;
    expect(asked).toEqual({ resourceId: OUTSIDE });

    rerender({ available: true, resources: [...outside] });
    expect(result.current).toBe(asked);

    rerender({ available: false, resources: outside });
    expect(result.current).toBeNull();
  });
});

describe('useSpaceAddresses', () => {
  it('reports a copy the clipboard refused, until it is dismissed', async () => {
    const location = { href: () => 'http://localhost/spaces/x' };
    const space = { id: SPACE_ID, title: 'Space' };
    const { result, rerender } = renderHook(() => useSpaceAddresses(location, space));
    const actions = result.current.entityActions;

    let copied: boolean | undefined;
    await act(async () => {
      copied = await result.current.copyProductDestination({ kind: 'space', spaceId: SPACE_ID });
    });
    expect(copied).toBe(false);
    expect(result.current.clipboardFailure).toBe(CLIPBOARD_REFUSAL);

    act(() => result.current.dismissClipboardFailure());
    expect(result.current.clipboardFailure).toBeNull();

    rerender();
    expect(result.current.entityActions).toBe(actions);
  });
});

describe('useResourceRailActions', () => {
  const railFor = (opened: OpenSpace, available: boolean) => {
    const space = derivationSpace();
    return renderHook(() =>
      useResourceRailActions(opened.app, {
        space,
        map: drawnMap(),
        entityActions: () => [[{ id: 'copy-link', label: 'Copy link', onSelect: () => 'done' }]],
        availability: {
          addResource: available,
          authorOnCanvas: available,
          deleteResource: available,
        },
        editingResourceBody: false,
        createReferenceFrom: () => 'done',
        spaces: null,
      }),
    );
  };
  const ids = (groups: ReturnType<ReturnType<typeof railFor>['result']['current']>) =>
    groups.map((group) => group.map(({ id }) => id));

  it('offers no commands for a Resource the Space no longer has', () => {
    const { result } = railFor(openDerivationSpace(), true);
    expect(result.current(CREATED)).toEqual([]);
  });

  it('offers what availability allows, and Remove from Map removes', async () => {
    const opened = openDerivationSpace();
    expect(ids(railFor(opened, false).result.current(PLACED_A))).toEqual([['copy-link']]);

    const groups = railFor(opened, true).result.current(PLACED_A);
    expect(ids(groups)).toEqual([
      ['create-reference'],
      ['copy-link'],
      ['remove-from-map', 'delete-resource'],
    ]);
    act(() => {
      void groups[2]?.[0]?.onSelect();
    });
    await waitFor(() => expect(placedIds(opened)).not.toContain(PLACED_A));
  });
});

describe('useSpaceResourceTargetTitles', () => {
  it('names each referenced Space by its target Title', async () => {
    const target: SpaceResourceTarget = { id: TARGET_SPACE, title: 'Elsewhere', maps: [] };
    const resources: readonly Resource[] = [
      {
        id: CREATED,
        title: 'Frame',
        kind: 'space',
        spaceId: TARGET_SPACE,
        map: MAP_ID,
        graph: GRAPH_ID,
      },
    ];
    const source = {
      target: (spaceId: UUID) => Promise.resolve(spaceId === TARGET_SPACE ? target : undefined),
    };
    const { result } = renderHook(() => useSpaceResourceTargetTitles(source, resources));
    await waitFor(() => expect(result.current.titleById.get(TARGET_SPACE)).toBe('Elsewhere'));
    expect(result.current.targets.get(TARGET_SPACE)).toBe(target);
  });
});

describe('useNameOnCreation', () => {
  it('follows the continuation to the Resource a creation names', () => {
    const { app } = openDerivationSpace();
    const { result } = renderHook(() => useNameOnCreation(app.continuation));
    expect(result.current).toBeNull();

    act(() =>
      app.continuation.request({
        target: { kind: 'resource', resourceId: PLACED_A },
        select: true,
        then: 'rename',
      }),
    );
    expect(result.current).toBe(PLACED_A);
  });
});

/** What the leave guard is rendered with. */
interface LeaveGuardProps {
  readonly kind: SpaceSessionState['persistence']['kind'];
}

describe('useUnsettledLeaveGuard', () => {
  const leave = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('asks before leaving only while persistence is unsettled', () => {
    const initialProps: LeaveGuardProps = { kind: 'settled' };
    const { rerender, unmount } = renderHook(({ kind }) => useUnsettledLeaveGuard(kind), {
      initialProps,
    });
    expect(leave()).toBe(false);
    rerender({ kind: 'pending' });
    expect(leave()).toBe(true);
    unmount();
    expect(leave()).toBe(false);
  });
});

describe('useDockChrome', () => {
  const chromeFor = (opened: OpenSpace, activeGraphId: DockChromeInput['activeGraphId']) => {
    const space = derivationSpace();
    const view = mapView(space, MAP_ID);
    const location = { chooseMap: vi.fn(), activateGraph: vi.fn() };
    const availability = authoringAvailability({
      editable: true,
      presenting: false,
      editingResourceBody: false,
      editingResourceTitle: false,
      resourceIsOpen: false,
      editingChromeTitle: false,
      spaceOnCanvas: true,
      editingEmbeddedMap: false,
      creatingSpaceResource: false,
    });
    const containingSpaceId = () => SPACE_ID;
    const reportBreak = () => undefined;
    const placement = renderHook(() =>
      useResourcePlacement(opened, {
        map: view.selectedMap.map,
        presenting: false,
        replacementEpoch: 0,
        reportBreak,
      }),
    ).result.current;
    return renderHook(() =>
      useDockChrome(opened, location, {
        space,
        map: view.selectedMap.map,
        projection: view.projection,
        activeGraphId,
        presenting: false,
        active: false,
        persistence: { kind: 'settled' },
        replacementEpoch: 0,
        availability,
        onRenamingChange: () => undefined,
        entityActions: () => [],
        spaces: null,
        resources: {
          outside: view.resourcesOutsideMap,
          memberships: view.membershipsOutsideMap,
          spaceTitleById: new Map(),
          disclose: null,
          addressedResourceId: null,
          placement,
        },
        containingSpaceId,
        reportBreak,
      }),
    );
  };

  it('draws no Dock while the Map shows no Active Graph', () => {
    expect(chromeFor(openDerivationSpace(), null).result.current.chrome).toBeNull();
  });

  it('draws the Space, Map, Graph and Resources the canvas draws', () => {
    const chrome = chromeFor(openDerivationSpace(), GRAPH_ID).result.current.chrome;
    expect(chrome?.canvas.selected.id).toBe(MAP_ID);
    expect(chrome?.graph.active.id).toBe(GRAPH_ID);
    expect(chrome?.graph.presentDisabled).toBe(false);
    expect(chrome?.resources.list.resources.map(({ id }) => id)).toEqual([OUTSIDE]);
    // An isolated mount has no open set to exit into.
    expect(chrome?.space.exitDisabled).toBe(true);
  });

  it('renames the Space through Authoring', () => {
    const opened = openDerivationSpace();
    const chrome = chromeFor(opened, GRAPH_ID).result.current.chrome;
    let answer: string | null | undefined;
    act(() => {
      answer = chrome?.space.onRename?.('Renamed');
    });
    expect(answer).toBeNull();
    expect(opened.session.getState().working.document.title).toBe('Renamed');
  });

  it("creates a markdown Resource on the drawing Map from the Create cluster's press", () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const chrome = chromeFor(opened, GRAPH_ID).result.current.chrome;
    act(() => chrome?.resources.onCreate('markdown'));
    expect(placedIds(opened)).toContain(CREATED);
  });

  it('adds a Graph to the drawing Map', () => {
    const opened = openDerivationSpace(mintingIds(CREATED));
    const chrome = chromeFor(opened, GRAPH_ID).result.current.chrome;
    act(() => chrome?.graph.onCreate());
    const drawn = opened.session.getState().working.document.maps?.find(({ id }) => id === MAP_ID);
    expect(drawn?.graphs.map(({ id }) => id)).toEqual([GRAPH_ID, CREATED]);
  });

  it('creates a Map, forgetting whether the last creation moved the caret', async () => {
    const opened = openDerivationSpace();
    const { result } = chromeFor(opened, GRAPH_ID);
    const chrome = result.current.chrome;
    // An earlier creation whose caret did land in the new Map's name.
    result.current.onChromeContinuationLand();
    expect(chrome?.canvas.didCreateMoveCaret()).toBe(true);
    await act(async () => {
      chrome?.canvas.onCreate?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(opened.session.getState().working.document.maps).toHaveLength(3);
    });
    expect(chrome?.canvas.didCreateMoveCaret()).toBe(false);
  });

  it('deletes the drawing Map and leaves the survivor', async () => {
    const opened = openDerivationSpace();
    const chrome = chromeFor(opened, GRAPH_ID).result.current.chrome;
    await act(async () => {
      chrome?.canvas.onDelete?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(opened.session.getState().working.document.maps?.map(({ id }) => id)).toEqual([
        OTHER_MAP_ID,
      ]);
    });
  });
});
