import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './tailwind.css';
import './styles.css';
import { openWorkspace } from './space';
import { startApplication } from './startup';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
void startApplication(root, openWorkspace);
