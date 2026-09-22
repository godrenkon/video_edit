import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './layout-fixes.css';
import './recovery.css';
import './media-metadata.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const buildId = (globalThis as typeof globalThis & { __SUIRAM_BUILD_ID__?: unknown }).__SUIRAM_BUILD_ID__;
  const reportBuild = () => {
    if (typeof buildId !== 'string' || !/^[0-9a-f]{16}$/.test(buildId)) return;
    navigator.serviceWorker.controller?.postMessage({ kind: 'client-build', buildId });
  };
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.kind === 'request-client-build') reportBuild();
  });
  navigator.serviceWorker.addEventListener('controllerchange', reportBuild);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(reportBuild)
      .catch((error) => {
        console.warn('Service worker registration failed', error);
      });
  });
}
