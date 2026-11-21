"""README.md describes the published drill run in the judge card's own words: the run file's label, which the judge
page prints. When the label changes, the README changes with it."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_the_readme_describes_the_run_in_the_label_words():
    label = json.loads((ROOT / "web/public/evidence/published-run.json").read_text())["label"]
    m = re.fullmatch(r"Development drill, (.+)\. Training drill\. Nobody is missing\.", label)
    assert m, f"the run label has an unexpected shape: {label!r}"
    readme = " ".join((ROOT / "README.md").read_text().split())
    assert m.group(1) in readme, f"README.md does not say {m.group(1)!r}"
