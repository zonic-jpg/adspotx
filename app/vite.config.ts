import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@landing": path.resolve(import.meta.dirname, "src/landing"),
      "@earn": path.resolve(import.meta.dirname, "src/earn"),
      "@brands": path.resolve(import.meta.dirname, "src/brands"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: false,
    // Dev: forward /api to the api-server (pnpm dev:api). In production the
    // api-server serves the built app itself (STATIC_DIR), same origin.
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:3001", changeOrigin: true } },
  },
  preview: { port: 4173, host: "0.0.0.0" },
});
