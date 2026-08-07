import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Страница раздаётся api-server’ом по пути /zayavka на sfera-master.ru.
  // Без этого base сборка сошлалась бы на /assets/*, а этот путь в корне
  // домена уже занят статикой master-landing — страница открылась бы пустой.
  base: "/zayavka/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
});
