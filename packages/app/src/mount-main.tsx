import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { newUuid } from '@project/core';
import { Application } from './components/Application';
import { GitHubLocationForm } from './components/GitHubLocationForm';
import { createBrowserFullscreen } from './browser-fullscreen';
import { createBrowserHistory } from './browser-history';
import { createBrowserPresentationLinks } from './browser-presentation-channel';
import { resolveMountSource } from './mount/mount-source';
import { createMountedStartup } from './mount/mounted-startup';
import { sourceParameter } from './source-parameter';

/**
 * The mount entry (ADR 0130): the application composed over a GitHub location
 * mounted in the page, in place of `main.tsx`'s HTTP host. The static build
 * (`vite.mount.config.ts`) serves it.
 *
 * The location is the `source` parameter, else the build-time default, else
 * the page asks for one.
 */

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');
const root = createRoot(rootElement);

const configured = import.meta.env.VITE_HYPER_DEFAULT_SOURCE;
const buildDefault = configured === undefined || configured === '' ? undefined : configured;
const source = resolveMountSource(sourceParameter(window.location.href), buildDefault);

if (source.kind === 'ask') {
  root.render(
    <main aria-label="Open a talk" className="flex min-h-dvh items-center">
      <GitHubLocationForm
        navigate={(url) => window.location.assign(url)}
        href={() => window.location.href}
        failure={source.failure}
      />
    </main>,
  );
} else {
  const startup = createMountedStartup({
    location: source.location,
    fetch: (input, init) => window.fetch(input, init),
    newId: newUuid,
    createObjectUrl: (image) => URL.createObjectURL(image),
    fullscreen: createBrowserFullscreen(document),
    presentations: (scope) =>
      createBrowserPresentationLinks({
        openChannel: (name) => new BroadcastChannel(name),
        window,
        now: () => Date.now(),
        locks: 'locks' in navigator ? navigator.locks : undefined,
        scope,
      }),
    // The session's one history: the mount pins its source into it, and
    // everything the application writes goes through it after.
    history: createBrowserHistory(window),
  });
  root.render(<Application resolve={() => startup.resolve(window.location.pathname)} />);
}
