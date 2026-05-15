declare global {
  interface Window {
    openHonestBot: (ref?: string) => void;
  }
}

export function openHonestBot(ref = 'honest-landing') {
  if (typeof window === 'undefined') return;
  
  const botUrl = import.meta.env.VITE_HONEST_BOT_URL || 'https://t.me/MaxBotHonestMaster';
  const url = `${botUrl}?start=${ref}`;
  window.open(url, '_blank');
}