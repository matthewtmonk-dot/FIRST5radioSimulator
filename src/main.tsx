import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { useSession } from './store/session';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Development-only handle so the end-to-end tests can check engine state the
// trainee never sees. Not present in production builds.
if (import.meta.env.DEV) (window as unknown as { __firstFive: unknown }).__firstFive = { session: useSession };
