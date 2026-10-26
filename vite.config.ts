import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/frontend", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3002",
      "/j": "http://localhost:3002",
    },
  },
});
