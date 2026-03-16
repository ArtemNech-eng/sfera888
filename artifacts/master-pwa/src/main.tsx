import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  const base = import.meta.env.BASE_URL ?? "/master-pwa/";
  navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
}
