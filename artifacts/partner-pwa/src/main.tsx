import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "SW_UPDATED") {
      window.location.reload();
    }
  });

  // Unregister old /partner-pwa/ service workers
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) {
      if (reg.scope?.includes("/partner-pwa")) {
        reg.unregister();
      }
    }
  });

  const base = import.meta.env.BASE_URL ?? "/partner/";
  navigator.serviceWorker
    .register(`${base}sw.js`, { updateViaCache: "none" })
    .then(reg => reg.update())
    .catch(() => {});
}
