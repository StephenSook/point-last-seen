"""The spend reader's arithmetic: prices, unknown models, and the week-at-cap projection."""
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import ai_spend  # noqa: E402


def test_cost_uses_the_price_per_million_tokens():
    usd = ai_spend.cost({("gemini-3.5-flash-lite", "input"): 1_000_000, ("gemini-3.5-flash-lite", "output"): 1_000_000})
    assert usd == pytest.approx(0.30 + 2.50)


def test_a_model_without_a_price_fails_instead_of_counting_as_free():
    with pytest.raises(KeyError):
        ai_spend.cost({("gemini-9-unknown", "input"): 10})


def test_projection_charges_all_spend_to_practice_searches():
    p = ai_spend.projection(1.0, 10, cap=50, days=7)
    assert p["usdPerSession"] == pytest.approx(0.1)
    assert p["weekAtCapUsd"] == pytest.approx(35.0)
    assert p["fits"] is False
    assert ai_spend.projection(0.05, 10)["fits"] is True
    assert ai_spend.projection(0.05, 0)["usdPerSession"] is None


def test_every_model_the_repo_names_has_a_price():
    models = {m["id"] for m in __import__("json").loads((ROOT / "shared/constants/models.json").read_text())["models"]}
    priced = {m for m, _ in ai_spend.PRICES}
    assert models <= priced, f"no price for {sorted(models - priced)}"
    assert {kind for _, kind in ai_spend.PRICES} == {"input", "output"}


def test_the_cap_matches_the_function():
    ts = (ROOT / "functions/src/judgeSession.ts").read_text()
    assert int(re.search(r"JUDGE_SESSIONS_PER_DAY = (\d+)", ts).group(1)) == ai_spend.DAILY_CAP
