import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import Landing from './Landing.jsx';
import { usePath } from './router.js';

// The studio (engine, textures, controls) loads only when someone opens it.
const Studio = lazy(() => import('./App.jsx'));

function Root() {
  const path = usePath();
  const inStudio = path.replace(/\/+$/, '') === '/studio';
  useEffect(() => {
    document.title = inStudio ? 'Studio · RAUT SEMRAWUT' : 'RAUT SEMRAWUT · Zine collage maker';
  }, [inStudio]);
  if (!inStudio) return <Landing />;
  return (
    <Suspense fallback={<div className="studio-loading"><span />Opening studio…</div>}>
      <Studio />
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
