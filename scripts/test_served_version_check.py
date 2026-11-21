"""served_version_check against real git history: the live site passes only when it was built from main's
production inputs, whatever the commit graph between them looks like."""

import importlib.util
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location("sv", Path(__file__).with_name("served_version_check.py"))
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)


def git(repo: Path, *args: str) -> str:
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@example.com", "HOME": str(repo), "PATH": "/usr/bin:/bin:/opt/homebrew/bin"}
    return subprocess.run(["git", *args], cwd=repo, env=env, check=True, capture_output=True, text=True).stdout.strip()


def commit(repo: Path, files: dict[str, str], msg: str) -> str:
    for name, body in files.items():
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body)
        git(repo, "add", name)
    git(repo, "commit", "-q", "-m", msg)
    return git(repo, "rev-parse", "HEAD")


def repo_with_main(tmp_path: Path) -> tuple[Path, str]:
    """A repo whose main has one production commit; main is also published as origin/main."""
    r = tmp_path / "r"
    r.mkdir()
    git(r, "init", "-q", "-b", "main")
    commit(r, {"web/src/app.ts": "v1\n", "shared/constants/a.json": "{}\n", "firebase.json": "{}\n", "docs/x.md": "a\n"}, "base")
    head = commit(r, {"web/src/app.ts": "v2\n"}, "main change")
    git(r, "update-ref", "refs/remotes/origin/main", head)
    return r, head


def served(sha: str, dirty: bool = False) -> dict:
    return {"commit": sha, "dirty": dirty}


def test_the_site_built_from_main_passes(tmp_path):
    r, head = repo_with_main(tmp_path)
    assert sv.check(served(head), r) == []


def test_a_build_behind_main_on_a_production_file_fails_and_names_it(tmp_path):
    r, head = repo_with_main(tmp_path)
    base = git(r, "rev-parse", "HEAD~1")
    problems = sv.check(served(base), r)
    assert len(problems) == 1
    assert base[:8] in problems[0] and head[:8] in problems[0] and "web/src/app.ts" in problems[0]


def test_main_moving_only_tests_changelogs_docs_and_harness_pages_needs_no_deploy(tmp_path):
    r, head = repo_with_main(tmp_path)
    new = commit(r, {"web/e2e/a.spec.ts": "x\n", "web/CHANGELOG.md": "x\n", "web/src/app.test.ts": "x\n",
                     "shared/engine-ts/test/b.ts": "x\n", "web/harness/map.html": "x\n", "docs/x.md": "b\n",
                     "README.md": "x\n"}, "tests and docs only")
    git(r, "update-ref", "refs/remotes/origin/main", new)
    assert sv.check(served(head), r) == []


def test_a_squash_merge_with_the_same_content_passes(tmp_path):
    r, head = repo_with_main(tmp_path)
    git(r, "checkout", "-q", "-b", "side", "HEAD~1")
    side = commit(r, {"web/src/app.ts": "v2\n"}, "same change on a side branch")
    assert side != head
    assert sv.check(served(side), r) == []


def test_a_build_ahead_of_main_with_different_web_code_fails(tmp_path):
    r, head = repo_with_main(tmp_path)
    git(r, "checkout", "-q", "-b", "feature", head)
    ahead = commit(r, {"web/src/app.ts": "v3 not on main\n"}, "unmerged web change")
    problems = sv.check(served(ahead), r)
    assert len(problems) == 1 and "web/src/app.ts" in problems[0]


def test_main_is_origin_main_not_the_checked_out_branch(tmp_path):
    r, head = repo_with_main(tmp_path)
    git(r, "checkout", "-q", "-b", "feature", head)
    commit(r, {"web/src/app.ts": "v3 not on main\n"}, "feature checked out")
    # HEAD is the feature branch; the site serving main is still correct.
    assert sv.check(served(head), r) == []


def test_a_served_commit_missing_from_the_repository_cannot_be_checked(tmp_path):
    r, _ = repo_with_main(tmp_path)
    problems = sv.check(served("0123456789abcdef0123456789abcdef01234567"), r)
    assert len(problems) == 1 and "not in this repository" in problems[0]


def test_a_dirty_build_fails(tmp_path):
    r, head = repo_with_main(tmp_path)
    assert any("dirty" in p for p in sv.check(served(head, dirty=True), r))


def test_version_json_without_a_commit_fails(tmp_path):
    r, _ = repo_with_main(tmp_path)
    assert any("no commit" in p for p in sv.check({"dirty": False}, r))


def test_without_origin_main_it_fails_instead_of_guessing(tmp_path):
    r, head = repo_with_main(tmp_path)
    git(r, "update-ref", "-d", "refs/remotes/origin/main")
    assert any("origin/main" in p for p in sv.check(served(head), r))


def test_a_shallow_clone_is_refused(tmp_path):
    r, head = repo_with_main(tmp_path)
    shallow = tmp_path / "shallow"
    subprocess.run(["git", "clone", "-q", "--depth", "1", f"file://{r}", str(shallow)], check=True, capture_output=True)
    assert any("shallow" in p for p in sv.check(served(head), shallow))


def test_the_input_list_covers_what_the_hosted_build_reads():
    assert {"web", "shared", "firebase.json", "package.json", "package-lock.json"} <= set(sv.INPUTS)
    # Tests, e2e specs, harness pages and markdown are left out.
    excluded = " ".join(p for p in sv.INPUTS if p.startswith(":(exclude"))
    for word in ("web/e2e", "web/harness", "web/extras-harness", "*.test.ts", "*.md", "/test/"):
        assert word in excluded
