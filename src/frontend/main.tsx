import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Weight, width and optical size axes. Headings use the heavy, narrow, large-size end.
import "@fontsource-variable/bricolage-grotesque/standard.css";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
