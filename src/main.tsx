import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { syncOnLaunchIfEnabled } from './services/cloudSync';
import { requestPersistentStorage } from './services/storageStats';

registerSW({ immediate: true });
void requestPersistentStorage();
void syncOnLaunchIfEnabled();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
