import { useEffect, useState } from "react";
import { X, Share, Plus, HardHat } from "lucide-react";

const DISMISSED_KEY = "pwa-install-dismissed-v1";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as any).standalone === true)
  );
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed or user dismissed before
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Android/Chrome — listen for browser install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after a short delay so page loads first
      setTimeout(() => setVisible(true), 2500);
    };
    window.addEventListener("beforeinstallprompt", handler as any);

    // iOS Safari — show manual instructions
    if (isIos()) {
      setTimeout(() => {
        setShowIos(true);
        setVisible(true);
      }, 2500);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop for iOS sheet */}
      {showIos && (
        <div
          className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
          onClick={dismiss}
        />
      )}

      <div
        className={`fixed z-50 left-0 right-0 mx-auto transition-all duration-500 ${
          showIos
            ? "bottom-0 max-w-full rounded-t-2xl"
            : "bottom-4 max-w-sm px-4"
        }`}
        style={{ animation: "slideUp 0.4s ease-out" }}
      >
        <div
          className={`bg-white shadow-2xl ${
            showIos ? "rounded-t-2xl px-5 pt-5 pb-8" : "rounded-2xl px-4 py-4"
          }`}
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          {/* Drag handle for iOS sheet */}
          {showIos && (
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-4" />
          )}

          <button
            onClick={dismiss}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X size={14} className="text-gray-500" />
          </button>

          {showIos ? (
            // iOS manual instructions
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                     style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4338CA 100%)" }}>
                  <HardHat size={24} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Честный мастер</p>
                  <p className="text-sm text-gray-500">Добавьте иконку на экран</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">
                      Нажмите кнопку{" "}
                      <span className="inline-flex items-center gap-0.5 font-semibold text-blue-600">
                        <Share size={14} /> Поделиться
                      </span>{" "}
                      внизу Safari
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">
                      Выберите{" "}
                      <span className="inline-flex items-center gap-0.5 font-semibold">
                        <Plus size={14} className="bg-gray-200 rounded" /> На экран «Домой»
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">Нажмите <span className="font-semibold">Добавить</span></p>
                  </div>
                </div>
              </div>

              <button
                onClick={dismiss}
                className="w-full h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Понятно
              </button>
            </div>
          ) : (
            // Android/Chrome install prompt
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4338CA 100%)" }}>
                <HardHat size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Честный мастер</p>
                <p className="text-xs text-gray-500">Добавить иконку на экран</p>
              </div>
              <button
                onClick={install}
                className="shrink-0 px-4 h-9 rounded-xl text-white text-sm font-semibold"
                style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4338CA 100%)" }}
              >
                Добавить
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
