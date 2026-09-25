import { useEffect, useRef } from 'react';
import { newUuid } from '@project/core';
import { MemorySpaceBackendTestControl, type SpaceSessionState } from '@project/persistence';
import { Application } from '#components/Application';
import { snapshotFromSpace } from '#src/snapshot';
import { storyOpening, storySpaces } from './application';
import type { OpenSpace, OpenSpaces } from '#src/open-spaces';
import {
  authoredSnapshot,
  commandDockSnapshot,
  deepDiveSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  newSpaceFixture,
  platformSnapshot,
  spaceResourceDocument,
  traversalSnapshot,
} from './spaces';

export type DockScenario =
  | 'default'
  | 'new-space'
  | 'presenting'
  | 'save-failed'
  | 'save-rejected'
  | 'save-refused'
  | 'save-too-large'
  | 'save-conflict'
  | 'save-blocked'
  | 'save-failed-elsewhere';

/** The persistence state each failure scenario is arranged to reach. */
const UNWELL = {
  'save-failed': 'failed',
  'save-failed-elsewhere': 'failed',
  'save-rejected': 'rejected',
  // A distinct state from `save-rejected`: the backend
  // refused the aggregate rather than declining the request outright, and the
  // Dock draws the same dialog from a structured refusal instead of a code.
  'save-refused': 'refused',
  // A rejection the notice explains and retries rather than a dialog: the
  // author reduces content, and the Edits stay until a save fits.
  'save-too-large': 'rejected',
  'save-conflict': 'conflicted',
} as const satisfies Partial<Record<DockScenario, SpaceSessionState['persistence']['kind']>>;

const isUnwell = (scenario: DockScenario): scenario is keyof typeof UNWELL => scenario in UNWELL;

/**
 * Wait for the state the scenario is arranging, not for "no longer pending".
 *
 * `SpaceSession.submit` publishes no `pending` at all when the session is
 * coordinating or persistence-paused — it parks the snapshot and returns — so a
 * "not pending" test can be true before the commit has begun, and hand the
 * catalogue a well Space that turns unwell some unbounded number of ticks after
 * it mounted. Naming the state cannot pass early.
 */
const reaches = (
  session: OpenSpace['session'],
  kind: SpaceSessionState['persistence']['kind'],
): Promise<void> =>
  new Promise((resolve) => {
    const arrived = () => session.getState().persistence.kind === kind;
    const unsubscribe = session.subscribe(() => {
      if (arrived()) {
        unsubscribe();
        resolve();
      }
    });
    if (arrived()) {
      unsubscribe();
      resolve();
    }
  });

/** No open Space has a commit in flight, which is what makes the next queued result this one's. */
const quiesced = async (spaces: OpenSpaces): Promise<void> => {
  await Promise.all(
    spaces.getState().entries.map((entry) =>
      entry.session.getState().persistence.kind === 'pending'
        ? new Promise<void>((resolve) => {
            const unsubscribe = entry.session.subscribe(() => {
              if (entry.session.getState().persistence.kind !== 'pending') {
                unsubscribe();
                resolve();
              }
            });
          })
        : Promise.resolve(),
    ),
  );
};

/**
 * A blocked recovery, through the real lifecycle: a Space
 * Resource created in `rendering` is rejected (C0), a second created inside
 * its target conflicts there (C1), and an Edit in `rendering` asks C0's
 * recovery to replay, which the target, now held by C1, refuses.
 */
const blockSave = async (
  spaces: OpenSpaces,
  control: MemorySpaceBackendTestControl,
  rendering: OpenSpace,
): Promise<void> => {
  const containingMap = rendering.session.getState().working.document.defaultMap;
  if (containingMap === undefined) throw new Error('The blocked scenario needs a Map.');
  control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
  const created = await spaces.spaceResources.create({
    containingSpaceId: rendering.id,
    mapId: containingMap,
    title: 'Blocking Space',
    position: { x: 640, y: 0 },
  });
  if (created.kind !== 'completed') throw new Error('The blocked scenario created nothing.');
  await reaches(rendering.session, 'rejected');
  const resource = rendering.session
    .getState()
    .working.resources.find(({ id }) => id === created.resourceId);
  if (resource?.document.kind !== 'space') throw new Error('No Space Resource was created.');
  const target = await spaces.embed(resource.document.spaceId);
  const stored = target.session.getState().working;
  const targetMap = stored.document.defaultMap;
  if (targetMap === undefined) throw new Error('The blocking Space has no Map.');
  control.queueResult({
    kind: 'conflict',
    conflicts: [
      {
        spaceId: target.id,
        current: { snapshot: stored, revision: 0n, exportedRevision: null },
      },
    ],
  });
  await spaces.spaceResources.create({
    containingSpaceId: target.id,
    mapId: targetMap,
    title: 'Child',
    position: { x: 320, y: 0 },
  });
  await reaches(target.session, 'conflicted');

  const notes = rendering.session.getState().working.resources[0];
  if (notes === undefined) throw new Error('The blocked scenario needs an editable Resource.');
  const edited = rendering.app.authoring.complete({
    kind: 'edited-resource',
    resourceId: notes.id,
    document: { ...notes.document, title: `${notes.document.title} edited` },
  });
  if (edited.kind !== 'completed')
    throw new Error('The blocked scenario did not complete an Edit.');
  await new Promise<void>((resolve) => {
    const blocked = () => {
      const { persistence } = rendering.session.getState();
      return persistence.kind === 'rejected' && persistence.blocked !== undefined;
    };
    if (blocked()) {
      resolve();
      return;
    }
    const unsubscribe = rendering.session.subscribe(() => {
      if (!blocked()) return;
      unsubscribe();
      resolve();
    });
  });
};

/** Open the authored crossing chain through the real session owner. */
export async function openDockStory(scenario: DockScenario) {
  const control = new MemorySpaceBackendTestControl();
  const snapshots = [
    metaSnapshot,
    platformSnapshot,
    designSystemSnapshot,
    commandDockSnapshot,
    traversalSnapshot,
    authoredSnapshot,
    deepDiveSnapshot,
  ];
  if (scenario === 'new-space') {
    const snapshot = snapshotFromSpace(newSpaceFixture);
    const meta = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: newUuid(),
          document: spaceResourceDocument(snapshot.document.title, snapshot),
        },
      ],
    };
    const spaces = storySpaces(meta.id, [
      meta,
      ...snapshots.filter((each) => each.id !== meta.id),
      snapshot,
    ]);
    return storyOpening(spaces, await spaces.open(snapshot.id));
  }
  const spaces = storySpaces(metaSnapshot.id, snapshots, control);
  await spaces.open(metaSnapshot.id);
  await spaces.enter(platformSnapshot.id);
  await spaces.enter(designSystemSnapshot.id);
  const rendering = await spaces.enter(commandDockSnapshot.id);
  await spaces.switchTo(metaSnapshot.id);
  await spaces.enter(traversalSnapshot.id);
  await spaces.switchTo(rendering.id);

  if (scenario === 'presenting') rendering.app.navigation.present();
  if (scenario === 'save-blocked') {
    await quiesced(spaces);
    await blockSave(spaces, control, rendering);
  }
  if (isUnwell(scenario)) {
    const target =
      scenario === 'save-failed-elsewhere' ? spaces.entry(designSystemSnapshot.id) : rendering;
    if (target === undefined) throw new Error('The failure scenario has no open target.');
    // The queue is the *backend's*, not a Space's, so whichever commit reaches
    // it first takes what is on it. Arming it while a crossing's commit is
    // still in flight would put the failure on that Space instead — and for
    // `save-failed-elsewhere`, on the very Space the scenario says is well.
    await quiesced(spaces);
    const stored = target.session.getState();
    if (scenario === 'save-conflict') {
      control.queueResult({
        kind: 'conflict',
        conflicts: [
          {
            spaceId: target.id,
            current: { snapshot: stored.working, revision: 0n, exportedRevision: null },
          },
        ],
      });
    } else if (scenario === 'save-rejected') {
      control.queueResult({
        kind: 'permanent-failure',
        code: 'forbidden',
      });
    } else if (scenario === 'save-too-large') {
      control.queueResult({
        kind: 'permanent-failure',
        code: 'payload-too-large',
      });
    } else if (scenario === 'save-refused') {
      control.queueResult({
        kind: 'aggregate-refused',
        errors: [{ kind: 'ordinary-space-unreferenced', spaceId: target.id }],
      });
    } else {
      control.queueResult({
        kind: 'retryable-failure',
        code: 'network',
      });
    }
    // A real Edit creates the failed commit; the same Map and title remain
    // on screen so recovery can be compared without changing the scenario.
    const resource = stored.working.resources[0];
    if (resource === undefined) throw new Error('The failure scenario needs an editable Resource.');
    const result = target.app.authoring.complete({
      kind: 'edited-resource',
      resourceId: resource.id,
      document:
        resource.document.kind === 'markdown'
          ? { ...resource.document, body: `${resource.document.body}\nStory edit` }
          : { ...resource.document, title: `${resource.document.title} edited` },
    });
    if (result.kind !== 'completed')
      throw new Error('The failure scenario did not complete an Edit.');
    await reaches(target.session, UNWELL[scenario]);
  }
  return storyOpening(spaces, rendering);
}

/** Fixture setup only; Application owns startup, commands, recovery and rendering. */
export function CommandDockFixture({ scenario = 'default' }: { readonly scenario?: DockScenario }) {
  return <Application resolve={() => openDockStory(scenario)} />;
}

/**
 * The Dock's grip, whichever slot it is currently in.
 *
 * Matched on the stable half of its accessible name rather than on the whole
 * composed sentence: the slot half (`Top edge, centre.`) is presentation this
 * fixture has no stake in, and pinning it made a label rename look like a
 * missing control.
 */
const dockGrip = (root: ParentNode): HTMLElement | null => {
  const grip = [...root.querySelectorAll('button[aria-label^="Move Command Dock."]')].find(
    (button) => button.closest('[hidden]') === null,
  );
  return grip instanceof HTMLElement ? grip : null;
};

/**
 * The centre stop of the **left** edge, found through its own group.
 *
 * **Not `findLast('Middle')`.** Both vertical edges label their centre stop
 * `Middle` (`ALONG_LABEL.vertical.center`), so picking the last one selects the
 * left edge only because `left` happens to sit last in `DOCK_EDGES` — and a
 * reorder of that tuple would silently dock this story to the *right*, which
 * an e2e asserting orientation alone cannot see. Walking forward from the
 * `Left edge` group label names the edge itself, so the worst a rename can do
 * is stall, which shows up as a Dock still at the top.
 */
const leftEdgeMiddle = (): HTMLElement | null => {
  const items = [...document.querySelectorAll('[role="menuitemradio"], [role="group"] > *')];
  const label = items.findIndex((item) => item.textContent === 'Left edge');
  if (label === -1) return null;
  const slot = items
    .slice(label + 1)
    .find((item) => item.getAttribute('role') === 'menuitemradio' && item.textContent === 'Middle');
  return slot instanceof HTMLElement ? slot : null;
};

/** Reach the side-edge scenario through the actual position menu, once per mount. */
export function LeftDockFixture() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = container.current;
    if (root === null) return;
    let opened = false;
    const observer = new MutationObserver(() => {
      if (!opened) {
        const grip = dockGrip(root);
        if (grip !== null) {
          opened = true;
          grip.click();
        }
        return;
      }
      const slot = leftEdgeMiddle();
      if (slot !== null) {
        observer.disconnect();
        slot.click();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container}>
      <CommandDockFixture />
    </div>
  );
}
