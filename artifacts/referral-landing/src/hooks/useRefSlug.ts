import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hm_ref_slug';

export function useRefSlug(): string | null {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    // Check URL params: ?ref=slug
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');

    // Check path: /r/:slug
    const pathMatch = window.location.pathname.match(/^\/r\/([^/]+)/);
    const pathSlug = pathMatch ? pathMatch[1] : null;

    const found = refParam || pathSlug;

    if (found) {
      sessionStorage.setItem(STORAGE_KEY, found);
      setSlug(found);
    } else {
      // Try to retrieve from session storage (same session)
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setSlug(stored);
    }
  }, []);

  return slug;
}
