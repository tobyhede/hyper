import { describe, expect, it } from 'vitest';
import {
  presentingFullscreen,
  type Fullscreen,
  type PresentingTraversal,
} from '../src/presenting-fullscreen';

/** A stand-in browser whose fullscreen the test grants, refuses and leaves. */
function standInFullscreen() {
  let active = false;
  const listeners = new Set<() => void>();
  const pending: ((entered: boolean) => void)[] = [];
  let requests = 0;
  let exits = 0;
  const change = (next: boolean) => {
    active = next;
    for (const listener of [...listeners]) listener();
  };
  const fullscreen: Fullscreen = {
    enter: () => {
      requests += 1;
      return new Promise<boolean>((resolve) => pending.push(resolve));
    },
    exit: () => {
      exits += 1;
      if (active) change(false);
    },
    active: () => active,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    fullscreen,
    requests: () => requests,
    exits: () => exits,
    /** The browser grants the oldest request: fullscreen changes, then it answers. */
    grant: () => {
      change(true);
      pending.shift()?.(true);
    },
    refuse: () => pending.shift()?.(false),
    /** Fullscreen ends by a route the application did not take, such as the browser's Escape. */
    leaveByBrowser: () => change(false),
    /** Fullscreen begins by a route the application did not take. */
    enterByBrowser: () => change(true),
    isActive: () => active,
  };
}

/** A stand-in for Navigation's presenting mode, with an Active Graph to present. */
function standInTraversal() {
  let presenting = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    presenting = next;
    for (const listener of [...listeners]) listener();
  };
  const traversal: PresentingTraversal = {
    presenting: () => presenting,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    present: () => set(true),
    exitPresenting: () => set(false),
  };
  return { traversal, isPresenting: () => presenting, openFromLink: () => set(true) };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function connected() {
  const browser = standInFullscreen();
  const navigation = standInTraversal();
  const coordinator = presentingFullscreen(browser.fullscreen, navigation.traversal);
  const disconnect = coordinator.connect();
  return { browser, navigation, coordinator, disconnect };
}

describe('presentingFullscreen', () => {
  it('requests fullscreen within the gesture that starts presenting', () => {
    const { browser, navigation, coordinator } = connected();

    coordinator.present();

    expect(navigation.isPresenting()).toBe(true);
    expect(browser.requests()).toBe(1);
  });

  it('requests nothing when Present declines to start presenting', () => {
    const browser = standInFullscreen();
    const traversal: PresentingTraversal = {
      ...standInTraversal().traversal,
      present: () => undefined,
    };
    const coordinator = presentingFullscreen(browser.fullscreen, traversal);
    coordinator.connect();

    coordinator.present();

    expect(browser.requests()).toBe(0);
  });

  it('leaves presenting when the fullscreen it entered ends', async () => {
    const { browser, navigation, coordinator } = connected();
    coordinator.present();
    browser.grant();
    await settle();

    browser.leaveByBrowser();

    expect(navigation.isPresenting()).toBe(false);
  });

  it('exits the fullscreen it entered when presenting ends another way', async () => {
    const { browser, navigation, coordinator } = connected();
    coordinator.present();
    browser.grant();
    await settle();

    navigation.traversal.exitPresenting();

    expect(browser.isActive()).toBe(false);
    expect(browser.exits()).toBe(1);
  });

  it('does not end a presentation opened from a link on an unrelated fullscreen change', () => {
    const { browser, navigation } = connected();
    navigation.openFromLink();

    browser.enterByBrowser();
    browser.leaveByBrowser();

    expect(browser.requests()).toBe(0);
    expect(navigation.isPresenting()).toBe(true);
  });

  it('tolerates a refused request and is not ended by a later unrelated fullscreen', async () => {
    const { browser, navigation, coordinator } = connected();
    coordinator.present();
    browser.refuse();
    await settle();

    browser.enterByBrowser();
    browser.leaveByBrowser();

    expect(navigation.isPresenting()).toBe(true);
  });

  it('requests nothing when the document is already fullscreen', () => {
    const { browser, navigation, coordinator } = connected();
    browser.enterByBrowser();

    coordinator.present();

    expect(navigation.isPresenting()).toBe(true);
    expect(browser.requests()).toBe(0);
  });

  it('does not adopt a later fullscreen after presenting began in one it did not request', () => {
    const { browser, navigation, coordinator } = connected();
    browser.enterByBrowser();
    coordinator.present();

    browser.leaveByBrowser();
    expect(navigation.isPresenting()).toBe(true);
    browser.enterByBrowser();
    browser.leaveByBrowser();

    expect(navigation.isPresenting()).toBe(true);
  });

  it('exits a fullscreen granted after presenting already ended', async () => {
    const { browser, navigation, coordinator } = connected();
    coordinator.present();
    navigation.traversal.exitPresenting();

    browser.grant();
    await settle();

    expect(browser.isActive()).toBe(false);
    expect(navigation.isPresenting()).toBe(false);
  });

  it('stops following both once disconnected', async () => {
    const { browser, navigation, coordinator, disconnect } = connected();
    coordinator.present();
    browser.grant();
    await settle();

    disconnect();
    browser.leaveByBrowser();

    expect(navigation.isPresenting()).toBe(true);
  });
});
