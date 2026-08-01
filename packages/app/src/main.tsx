import { createRoot } from 'react-dom/client';
import './tailwind.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { createWorkspaceStartup } from './space';
import { startApplication } from './startup';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const root = createRoot(rootElement);
const workspaceStartup = createWorkspaceStartup();
void startApplication(
  root,
  () => workspaceStartup.resolve(),
  (id) => workspaceStartup.openSelected(id),
);
