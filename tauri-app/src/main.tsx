import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyMaterialYouExpressiveTheme } from "./theme/materialYouExpressive";
import { AccentProvider, initAccent } from "./theme/accent";

// M3 Expressive 2025 — monochrome base #121212 / #FFFFFF, phone, standard contrast
applyMaterialYouExpressiveTheme({ baseHex: "#121212", scheme: "monochrome", contrast: 0, spec: "2025", platform: "phone" });
// Accent oversync — restaura el preset guardado antes del primer render (sin flash)
initAccent();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AccentProvider>
      <App />
    </AccentProvider>
  </React.StrictMode>,
);
