import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CommandPost } from "./command/CommandPost";
import "./theme/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <CommandPost />
  </StrictMode>,
);
