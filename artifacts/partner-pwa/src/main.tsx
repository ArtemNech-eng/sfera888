import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service Worker temporarily disabled to debug 404 issues
if ("serviceWorker" in navigator) {
  // Unregister ALL service workers
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) {
      reg.unregister();
    }
  });
}
