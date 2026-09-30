import { useEffect, useState } from 'react';

/* Minimal client-side routing on the History API: two routes don't need a router library.
   Vercel rewrites every path to index.html (vercel.json), so deep links work. */
const listeners = new Set();

export function navigate(path) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  window.scrollTo(0, 0);
  listeners.forEach(fn => fn(path));
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    listeners.add(setPath);
    window.addEventListener('popstate', onPop);
    return () => { listeners.delete(setPath); window.removeEventListener('popstate', onPop); };
  }, []);
  return path;
}

/* <a> that navigates in-app on a plain left click and behaves normally otherwise. */
export function linkProps(path) {
  return {
    href: path,
    onClick: e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(path);
    },
  };
}
