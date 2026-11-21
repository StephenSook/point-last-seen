import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CommandPost } from "./command/CommandPost";
import { JudgePage } from "./judge/JudgePage";
import { startNewBuildWatch } from "./pwa/takeover";
import "./theme/fonts.css";
import "./theme/base.css";

// A new deploy's worker takes over this page: reload into the new build (or ask while words are typed).
startNewBuildWatch();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    {location.pathname.replace(/\/+$/, "") === "/judge" ? <JudgePage /> : <CommandPost />}
  </StrictMode>,
);
