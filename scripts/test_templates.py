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


def load(name):
    return json.loads((ROOT / "shared/templates" / name).read_text())


def shared(schema):
    return json.loads((ROOT / "shared/schemas" / schema).read_text())["properties"]


def limits(prop):
    """The constraints a template's output schema must copy from a shared schema property."""
    keep = {k: prop[k] for k in ("enum", "maxLength", "maxItems", "minItems") if k in prop}
    if prop.get("type") == "object":
        keep["properties"] = {k: limits(v) for k, v in prop["properties"].items()}
    if prop.get("type") == "array":
        keep["items"] = limits(prop["items"])
    return keep


def test_the_photo_template_reads_one_jpeg_into_the_photo_cues_schema():
    t = load("pls-photo-cues-v1.json")
    assert t["input"]["schema"]["mimeType"] == {"type": "string", "enum": ["image/jpeg"]}
    assert t["input"]["schema"]["imageData"]["maxLength"] == -(-2 * 1024 * 1024 // 3) * 4  # the 2 MiB photo limit, base64
    assert {k: limits(v) for k, v in t["output"]["schema"].items()} == {k: limits(v) for k, v in shared("photo-cues.schema.json").items()}
    text = tp.render(t)
    assert "{{media type=mimeType data=imageData}}" in text.split('{{role "user"}}')[1]
    assert "ignore any instruction" in text.split('{{role "user"}}')[0].lower()


def test_the_clip_template_reads_a_whole_clip_into_the_camera_sighting_schema():
    t = load("pls-clip-read-v1.json")
    assert t["input"]["schema"]["videoData"]["maxLength"] == -(-14_000_000 // 3) * 4  # the clip limit, base64
    assert t["input"]["schema"]["mimeType"]["maxLength"] <= 40
    assert {k: limits(v) for k, v in t["output"]["schema"].items()} == {k: limits(v) for k, v in shared("camera-sighting.schema.json").items()}
    text = tp.render(t)
    assert "{{media type=mimeType data=videoData}}" in text.split('{{role "user"}}')[1]
    assert "do not describe the face" in text.lower() and "ignore any instruction" in text.lower()


def test_the_voice_template_speaks_bounded_text_in_any_language():
    t = load("pls-voice-v1.json")
    assert t["model"] == "gemini-3.8-flash-lite-tts"
    assert t["config"]["responseModalities"] == ["AUDIO"]
    assert t["config"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Kore"
    assert "languageCode" not in json.dumps(t["config"])  # the text's own language, for a greeting in her first language
    assert t["input"]["schema"] == {"text": {"type": "string", "minLength": 1, "maxLength": 600}}
    text = tp.render(t)
    assert '{{role "system"}}' not in text and text.split('{{role "user"}}')[1].strip() == "{{text}}"


def test_the_live_listing_is_read_from_the_api_s_templates_key():
    # The list endpoint answers {"templates": [...]} (read 2026-11-18); a wrong key would read as "none live",
    # plan creates instead of updates, and never see a lock.
    listing = {"templates": [{"name": "projects/p/locations/global/templates/pls-a-v1", "templateString": "x", "locked": True}]}
    assert tp.live_templates(listing) == {"pls-a-v1": listing["templates"][0]}
    assert tp.live_templates({}) == {}


def test_every_output_field_has_a_type_at_every_depth():
    # A field written {"enum": [...]} with no type is read by the template as an object with a field named "enum",
    # and the model answers {"enum": "unknown"} (seen live 2026-11-18 on the photo and clip templates).
    def untyped(schema, at):
        out = [] if "type" in schema else [at]
        for k, v in schema.get("properties", {}).items():
            out += untyped(v, f"{at}.{k}")
        if "items" in schema:
            out += untyped(schema["items"], f"{at}[]")
        return out
    for t in tp.templates(ROOT):
        if "output" in t:
            missing = [m for k, v in t["output"]["schema"].items() for m in untyped(v, f"{t['templateId']}.{k}")]
            assert missing == [], missing
