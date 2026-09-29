import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/type.css';
import './index.css';
import { Root } from './Root.tsx';

/* The theme goes on BEFORE anything renders. App sets it too, but the
   sign-in screen renders without App -- so a dark-mode person signed out saw a
   light page, and everyone else got one light frame before App's effect. Same
   rule as App: saved choice, else the system's. */
try {
  const saved = localStorage.getItem('growth.theme');
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch { /* storage disabled: tokens.css defaults apply */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
