import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CommandPost } from "./command/CommandPost";
import { JudgePage } from "./judge/JudgePage";
import "./theme/fonts.css";
import "./theme/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    {location.pathname.replace(/\/+$/, "") === "/judge" ? <JudgePage /> : <CommandPost />}
  </StrictMode>,
);
