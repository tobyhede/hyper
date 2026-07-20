import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import 'reveal.js/dist/reveal.css';
import 'reveal.js/dist/theme/black.css';
import './tailwind.css';
import './styles.css';
import { AppRouter } from './router';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
