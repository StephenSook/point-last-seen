import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { startNewBuildWatch } from "./pwa/takeover";
import "./theme/fonts.css";
import "./theme/base.css";

// Each page loads its own code: the judge page never downloads the command post's map and rails.
const CommandPost = lazy(() => import("./command/CommandPost").then((m) => ({ default: m.CommandPost })));
const JudgePage = lazy(() => import("./judge/JudgePage").then((m) => ({ default: m.JudgePage })));

// A new deploy's worker takes over this page: reload into the new build (or ask while words are typed).
startNewBuildWatch();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <Suspense fallback={null}>{location.pathname.replace(/\/+$/, "") === "/judge" ? <JudgePage /> : <CommandPost />}</Suspense>
  </StrictMode>,
);
