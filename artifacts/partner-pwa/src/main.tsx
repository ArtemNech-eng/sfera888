import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Auto-reload when stale index.html references chunk hashes that no longer exist.
const RELOAD_KEY = "__chunkReloadAt";
const tryReloadOnChunkError = (msg: string) => {
  if (
    !/Failed to fetch dynamically imported module/i.test(msg) &&
    !/Importing a module script failed/i.test(msg) &&
    !/Loading chunk \S+ failed/i.test(msg) &&
    !/Loading CSS chunk \S+ failed/i.test(msg)
  ) {
    return;
  }
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
};

window.addEventListener("error", (e) => {
  tryReloadOnChunkError(String(e?.message ?? ""));
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = (e as PromiseRejectionEvent).reason;
  tryReloadOnChunkError(String(reason?.message ?? reason ?? ""));
});

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/partner/sw.js", { scope: "/partner/" })
      .catch(() => {});
  });
}
