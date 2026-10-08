import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { createSpaceStartup } from './space';
import { Application } from './components/Application';
import { createBrowserFullscreen } from './browser-fullscreen';
import { FullscreenContext } from './fullscreen-context';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
const spaceStartup = createSpaceStartup();
root.render(
  <FullscreenContext.Provider value={createBrowserFullscreen(document)}>
    <Application resolve={() => spaceStartup.resolve(window.location.pathname)} />
  </FullscreenContext.Provider>,
);
