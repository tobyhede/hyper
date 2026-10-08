import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { createSpaceStartup } from './space';
import { Application } from './components/Application';
import { createBrowserFullscreen } from './browser-fullscreen';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
const spaceStartup = createSpaceStartup(createBrowserFullscreen(document));
root.render(<Application resolve={() => spaceStartup.resolve(window.location.pathname)} />);
