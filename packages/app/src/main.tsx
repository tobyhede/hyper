import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './tailwind.css';
import './styles.css';
import { createWorkspaceStartup } from './space';
import { startApplication } from './startup';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
const workspaceStartup = createWorkspaceStartup();
void startApplication(root, workspaceStartup.resolve, workspaceStartup.openSelected);
