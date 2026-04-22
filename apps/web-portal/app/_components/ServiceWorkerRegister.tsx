'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker en production seulement.
 * En dev, Next.js sert son propre fast-refresh qui entre en conflit.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('SW registration failed', err);
    });
  }, []);
  return null;
}
