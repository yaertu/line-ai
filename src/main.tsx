import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LineCliApp from "@/LineCliApp";
import "@/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Line CLI kök elementi bulunamadı.");
}

createRoot(root).render(
  <StrictMode>
    <LineCliApp />
  </StrictMode>
);
