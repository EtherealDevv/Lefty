import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyMaterialYouExpressiveTheme } from "./theme/materialYouExpressive";

// M3 Expressive 2025 — monochrome base #121212 / #FFFFFF, phone, standard contrast
applyMaterialYouExpressiveTheme({ baseHex: "#121212", scheme: "monochrome", contrast: 0, spec: "2025", platform: "phone" });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
