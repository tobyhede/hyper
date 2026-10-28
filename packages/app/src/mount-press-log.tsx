import { createRoot } from 'react-dom/client';
import { PressLog } from './components/PressLog';

/** Draw the press log over the application, in a root of its own. */
export function mountPressLog(): void {
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(<PressLog />);
}
