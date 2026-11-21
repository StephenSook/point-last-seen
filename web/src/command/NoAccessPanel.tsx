// What the post shows once this browser's access to the search is gone: why, and a way back that never traps it. A
// drill can be reopened (a reload keeps it in the link, so a sign-in that is back opens the post at once) or left for
// the join form; a practice search has no code, so it points to the judge's page. When the search's mode has not
// loaded and only its id suggests a practice search, both ways back are offered.

type Props = {
  /** Why this browser no longer acts here, from its sign-in (claimsLine), or null when that is not known. */
  line: string | null;
  practice: "yes" | "no" | "guess";
};

export function NoAccessPanel({ line, practice }: Props) {
  const drill = practice !== "yes";
  const judge = practice !== "no";
  return (
    <>
      <p data-testid="claims-line">{line ?? (drill ? "Reopen this drill, or join another search with its code." : "Open it again from the judge's page.")}</p>
      <div className="row">
        {judge && (
          <button type="button" onClick={() => location.assign("/judge")}>
            Open the judge's page
          </button>
        )}
        {drill && (
          <button type="button" onClick={() => location.reload()}>
            Reopen this drill
          </button>
        )}
        {drill && (
          <button type="button" onClick={() => location.assign(location.pathname)}>
            Join another search
          </button>
        )}
      </div>
    </>
  );
}
