import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './tailwind.css';
import './styles.css';
import { createAppRouter } from './router';
import { openWorkspace } from './space';
import { mountWorkspace } from './Workspace';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const start = async (): Promise<void> => {
  const opened = await openWorkspace();
  const root = createRoot(rootElement);
  mountWorkspace(opened, (app) => {
    const AppRouter = createAppRouter(() => app);
    root.render(
      <StrictMode>
        <AppRouter />
      </StrictMode>,
    );
  });
};

void start();
