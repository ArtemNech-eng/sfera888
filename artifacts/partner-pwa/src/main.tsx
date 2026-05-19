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

  const base = import.meta.env.BASE_URL ?? "/partner-pwa/";
  navigator.serviceWorker
    .register(`${base}sw.js`, { updateViaCache: "none" })
    .then(reg => reg.update())
    .catch(() => {});
}
