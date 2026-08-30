import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LineAiApp from "@/LineAiApp";
import "@/index.css";

const applyInitialTheme = () => {
  const requestedTheme = new URLSearchParams(window.location.search).get("theme");
  let storedTheme: "dark" | "light" | "system" = "system";
  try {
    const stored = JSON.parse(localStorage.getItem("line-ai.preferences.v1") ?? "null") as { theme?: unknown } | null;
    if (stored?.theme === "dark" || stored?.theme === "light" || stored?.theme === "system") {
      storedTheme = stored.theme;
    }
  } catch {
    // A corrupt preference must not block the first paint.
  }
  const theme = requestedTheme === "dark" || requestedTheme === "light" ? requestedTheme : storedTheme;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
};

applyInitialTheme();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Line AI kök elementi bulunamadı.");
}

createRoot(root).render(
  <StrictMode>
    <LineAiApp />
  </StrictMode>
);
