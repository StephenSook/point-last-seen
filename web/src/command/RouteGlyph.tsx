import type { RouteRecord } from "@pls/engine";

const LABEL: Record<RouteRecord["path"], string> = {
  cloud: "Cloud",
  on_device: "On this laptop",
  rules: "Fixed wording",
  unknown: "Route not reported",
};

function Icon({ path }: { path: RouteRecord["path"] }) {
  if (path === "cloud") return <path d="M5 13a3 3 0 0 1 .5-6 4 4 0 0 1 7.6-1A3 3 0 1 1 13 13Z" />;
  if (path === "on_device") return <path d="M3 4h12v8H3Zm-1 9h14" />;
  if (path === "rules") return <path d="M4 3h10v12H4Zm2 3h6M6 9h6M6 12h4" />;
  return <path d="M9 3a4 4 0 0 1 2 7.5c-1 .6-2 1.2-2 2.5M9 15.5v.5" />;
}

/** Where a model output came from: an icon and a word, never colour alone. */
export function RouteGlyph({ route }: { route: RouteRecord }) {
  return (
    <span className="route" data-testid="route-glyph" data-path={route.path}>
      <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <Icon path={route.path} />
      </svg>
      {LABEL[route.path]}
    </span>
  );
}
