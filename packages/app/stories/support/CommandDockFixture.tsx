import { useEffect, useRef } from 'react';
import { newUuid } from '@project/core';
import { MemorySpaceBackendTestControl } from '@project/persistence';
import { Application } from '#components/Application';
import { snapshotFromSpace } from '#src/snapshot';
import { storyOpening, storySpaces } from './application';
import {
  authoredSnapshot,
  commandDockSnapshot,
  deepDiveSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  newSpaceFixture,
  platformSnapshot,
  traversalSnapshot,
} from './spaces';

export type DockScenario =
  | 'default'
  | 'new-space'
  | 'presenting'
  | 'save-failed'
  | 'save-rejected'
  | 'save-conflict'
  | 'save-failed-elsewhere';

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
      cards: [
        ...metaSnapshot.cards,
        {
          id: newUuid(),
          document: {
            kind: 'space' as const,
            title: snapshot.document.title,
            spaceId: snapshot.id,
          },
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
  if (scenario.startsWith('save-')) {
    const target =
      scenario === 'save-failed-elsewhere' ? spaces.entry(designSystemSnapshot.id) : rendering;
    if (target === undefined) throw new Error('The failure scenario has no open target.');
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
        message: 'Permission denied',
      });
    } else {
      control.queueResult({
        kind: 'retryable-failure',
        code: 'network',
        message: 'Network unavailable',
      });
    }
    // A real Edit creates the failed commit; the same Diagram and title remain
    // on screen so recovery can be compared without changing the scenario.
    const card = stored.working.cards[0];
    if (card === undefined) throw new Error('The failure scenario needs an editable Card.');
    const result = target.app.authoring.complete({
      kind: 'edited-card',
      cardId: card.id,
      document:
        card.document.kind === 'markdown'
          ? { ...card.document, body: `${card.document.body}\nStory edit` }
          : { ...card.document, title: `${card.document.title} edited` },
    });
    if (result.kind !== 'completed')
      throw new Error('The failure scenario did not complete an Edit.');
    await new Promise<void>((resolve) => {
      const settled = () => target.session.getState().persistence.kind !== 'pending';
      const unsubscribe = target.session.subscribe(() => {
        if (settled()) {
          unsubscribe();
          resolve();
        }
      });
      if (settled()) {
        unsubscribe();
        resolve();
      }
    });
  }
  return storyOpening(spaces, rendering);
}

/** Fixture setup only; Application owns startup, commands, recovery and rendering. */
export function CommandDockFixture({ scenario = 'default' }: { readonly scenario?: DockScenario }) {
  return <Application resolve={() => openDockStory(scenario)} />;
}

/** Reach the side-edge scenario through the actual position menu, once per mount. */
export function LeftDockFixture() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = container.current;
    if (root === null) return;
    let opened = false;
    const observer = new MutationObserver(() => {
      if (!opened) {
        const grip = [
          ...root.querySelectorAll('button[aria-label="Move Command Dock. Top edge, centre."]'),
        ].find((button) => button.closest('[hidden]') === null);
        if (grip instanceof HTMLElement && grip.closest('[hidden]') === null) {
          opened = true;
          grip.click();
        }
      } else {
        const slot = [...document.querySelectorAll('[role="menuitemradio"]')].findLast(
          (item) => item.textContent === 'Middle',
        );
        if (slot instanceof HTMLElement) {
          observer.disconnect();
          slot.click();
        }
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
