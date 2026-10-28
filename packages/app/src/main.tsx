import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { createSpaceStartup } from './space';
import { Application } from './components/Application';
import { createBrowserFullscreen } from './browser-fullscreen';
import { createBrowserPresentationLinks } from './browser-presentation-channel';
import { pressLogEnabled } from './press-log';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
const spaceStartup = createSpaceStartup(
  createBrowserFullscreen(document),
  createBrowserPresentationLinks({
    openChannel: (name) => new BroadcastChannel(name),
    window,
    now: () => Date.now(),
    locks: 'locks' in navigator ? navigator.locks : undefined,
  }),
);
root.render(<Application resolve={() => spaceStartup.resolve(window.location.pathname)} />);

// A dev server started with VITE_KEY_LOG=1 draws the press log (`press-log.ts`).
if (pressLogEnabled) void import('./mount-press-log').then(({ mountPressLog }) => mountPressLog());
