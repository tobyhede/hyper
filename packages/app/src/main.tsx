import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './tailwind.css';
import './styles.css';
import { createApp } from './App';
import { createAppRouter } from './router';
import { openWorkspace } from './space';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const start = async (): Promise<void> => {
  const opened = await openWorkspace();
  const AppRouter = createAppRouter(createApp(opened));
  createRoot(rootElement).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>,
  );
};

void start();
