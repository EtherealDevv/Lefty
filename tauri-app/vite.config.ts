import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // WebView2 en Windows es Chromium moderno: no transpilar para Safari/Firefox.
    target: "chrome105",
    minify: "esbuild",
    cssMinify: "esbuild",
    sourcemap: false,
  },
});
