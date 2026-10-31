import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './theme-dark.css';
import { createSpaceStartup } from './space';
import { Application } from './components/Application';
import { createBrowserFullscreen } from './browser-fullscreen';
import { createBrowserPresentationLinks } from './browser-presentation-channel';
import { createBrowserColorScheme } from './browser-color-scheme';
import { ColorSchemeContext } from './color-scheme';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const colorScheme = createBrowserColorScheme(window);
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
root.render(
  <ColorSchemeContext.Provider value={colorScheme}>
    <Application resolve={() => spaceStartup.resolve(window.location.pathname)} />
  </ColorSchemeContext.Provider>,
);
