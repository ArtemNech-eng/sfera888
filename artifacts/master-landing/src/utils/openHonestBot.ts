declare global {
  interface Window {
    openHonestBot: (ref?: string) => void;
  }
}

export function openHonestBot(ref = 'honest-landing') {
  if (typeof window === 'undefined') return;
  
  const baseUrl = import.meta.env.VITE_HONEST_PWA_URL || '/master-pwa/';
  const url = `${baseUrl}?ref=${ref}`;
  window.open(url, '_blank');
}