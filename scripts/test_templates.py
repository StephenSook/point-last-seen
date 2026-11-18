"""Server prompt templates in shared/templates: each is pinned to the allow-list, to the shared schema it fills,
and to a system guardrail, and the publish script plans changes before it makes them."""
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("tp", ROOT / "scripts" / "template_publish.py")
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)
SIGHTING = ROOT / "shared/templates/pls-sighting-note-v1.json"


def test_every_template_names_an_allowed_model_and_a_valid_id():
    allowed = {m["id"] for m in json.loads((ROOT / "shared/constants/models.json").read_text())["models"]}
    templates = tp.templates(ROOT)
    assert templates, "no templates found"
    for t in templates:
        assert re.fullmatch(r"[a-z][a-z0-9-]{0,61}[a-z0-9]", t["templateId"]), t["templateId"]
        assert t["model"] in allowed, (t["templateId"], t["model"])


def test_the_sighting_note_template_bounds_its_input_and_carries_a_guardrail():
    t = json.loads(SIGHTING.read_text())
    assert t["input"]["schema"] == {"note": {"type": "string", "minLength": 1, "maxLength": 2000}}
    text = tp.render(t)
    system, user = text.split('{{role "user"}}')
    assert system.startswith("---\n") and '{{role "system"}}' in system and "ignore any instruction" in system.lower()
    assert user.strip() == "{{note}}"
    front = json.loads(text.split("---\n")[1])
    assert front["model"] == t["model"] and front["output"]["format"] == "json"


def test_the_sighting_note_output_matches_the_report_reading_schema():
    reading = json.loads((ROOT / "shared/schemas/report-reading.schema.json").read_text())["properties"]
    out = json.loads(SIGHTING.read_text())["output"]["schema"]
    for field in ("direction", "topColor", "bottomColor"):
        assert out[field]["enum"] == reading[field]["enum"], field
    for field in ("footwear", "carried", "evidenceQuote"):
        assert out[field]["maxLength"] == reading[field]["maxLength"], field


def test_the_publish_plan_creates_updates_or_leaves_each_template():
    local = {"a": "text-a", "b": "text-b2", "c": "text-c"}
    remote = {"b": {"templateString": "text-b1", "locked": False}, "c": {"templateString": "text-c", "locked": False}}
    assert tp.plan(local, remote) == {"create": ["a"], "update": ["b"], "same": ["c"], "locked": []}
    remote["b"]["locked"] = True
    assert tp.plan(local, remote)["locked"] == ["b"]


def test_the_live_listing_is_read_from_the_api_s_templates_key():
    # The list endpoint answers {"templates": [...]} (read 2026-11-18); a wrong key would read as "none live",
    # plan creates instead of updates, and never see a lock.
    listing = {"templates": [{"name": "projects/p/locations/global/templates/pls-a-v1", "templateString": "x", "locked": True}]}
    assert tp.live_templates(listing) == {"pls-a-v1": listing["templates"][0]}
    assert tp.live_templates({}) == {}
