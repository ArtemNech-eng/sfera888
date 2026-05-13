import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function LegacyLanding() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate('/honest', { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-honest-primary mx-auto mb-4"></div>
        <p>Перенаправление на новый лендинг...</p>
      </div>
    </div>
  );
}