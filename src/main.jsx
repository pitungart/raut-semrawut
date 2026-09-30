import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { LANDING_ENABLED } from './config.js';
import { usePath } from './router.js';

// Each route loads its own code: the studio (engine, textures, controls) and the landing page.
const Studio = lazy(() => import('./App.jsx'));
const Landing = lazy(() => import('./Landing.jsx'));

function Root() {
  const path = usePath();
  const inStudio = !LANDING_ENABLED || path.replace(/\/+$/, '') === '/studio';
  useEffect(() => {
    document.title = inStudio ? 'RAUT SEMRAWUT · Studio' : 'RAUT SEMRAWUT · Zine collage maker';
  }, [inStudio]);
  return (
    <Suspense fallback={<div className="studio-loading"><span />Loading…</div>}>
      {inStudio ? <Studio /> : <Landing />}
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
