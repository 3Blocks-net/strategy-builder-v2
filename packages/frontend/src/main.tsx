import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
// Bootstraps i18next and applies the visitor's language before the first paint.
import './i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
