"""The Remote Config template holds every key a client reads, and publishing it can never silently change or
drop a live value (review round 3: a one-key template would have cleared a kill_cloud pause)."""
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rc_publish.py"


def _mod():
    spec = importlib.util.spec_from_file_location("rc_publish", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def template() -> dict:
    return json.loads((ROOT / "remoteconfig.template.json").read_text())["parameters"]


def client_keys() -> dict[str, set[str]]:
    ios = (ROOT / "ios/PLS/Config/RemoteConfigValues.swift").read_text()
    ios_list = re.search(r"static let keys = \[(.*?)\]", ios, re.S)
    android = (ROOT / "android/app/src/main/java/app/pointlastseen/family/config/RcValues.kt").read_text()
    android_map = re.search(r"DEFAULT_MAP: Map<String, Any> = mapOf\((.*?)\n\s*\)", android, re.S)
    web = (ROOT / "web/src/config/rc.ts").read_text()
    web_obj = re.search(r"export const RC_DEFAULTS = \{(.*?)\}", web, re.S)
    assert ios_list and android_map and web_obj, "a client's Remote Config defaults moved; update this parser"
    return {
        "ios": set(re.findall(r'"([a-z_]+)"', ios_list.group(1))),
        "android": set(re.findall(r'"([a-z_]+)" to ', android_map.group(1))),
        "web": set(re.findall(r"^\s*([a-z_]+):", web_obj.group(1), re.M)),
    }


def test_the_template_holds_every_key_every_client_reads():
    keys = client_keys()
    assert all(len(k) >= 3 for k in keys.values()), keys  # the parsers found real lists
    missing = {client: sorted(k - set(template())) for client, k in keys.items() if k - set(template())}
    assert missing == {}


def test_the_template_values_are_the_intended_ones():
    t = {k: v["defaultValue"]["value"] for k, v in template().items()}
    assert t["kill_cloud"] == "false" and t["use_limited_use_tokens"] == "true"
    allowed = {m["id"] for m in json.loads((ROOT / "shared/constants/models.json").read_text())["models"]}
    for key in [k for k in t if "model" in k]:
        assert t[key] in allowed, key
    for key, p in template().items():
        assert p.get("valueType") in ("STRING", "BOOLEAN", "NUMBER") and p.get("description"), key


def test_a_plain_firebase_deploy_cannot_publish_the_template():
    # Only scripts/rc_publish.py publishes it, after reading the live template.
    assert "remoteconfig" not in json.loads((ROOT / "firebase.json").read_text())


def p(value: str) -> dict:
    return {"defaultValue": {"value": value}, "valueType": "STRING", "description": "d"}


def test_the_plan_refuses_a_changed_or_dropped_live_value_unless_named():
    rc = _mod()
    live = {"kill_cloud": p("true"), "old_key": p("x"), "same": p("y")}
    file = {"kill_cloud": p("false"), "same": p("y"), "new_key": p("z")}
    plan = rc.plan(live, file, allow=set())
    assert plan["added"] == ["new_key"] and plan["changed"] == ["kill_cloud"] and plan["removed"] == ["old_key"]
    assert plan["refused"] == ["kill_cloud", "old_key"]
    assert rc.plan(live, file, allow={"kill_cloud", "old_key"})["refused"] == []


def test_an_empty_live_template_only_adds():
    plan = _mod().plan({}, {"a": p("1")}, allow=set())
    assert plan == {"added": ["a"], "changed": [], "removed": [], "refused": []}


def test_a_conditional_value_counts_as_a_change():
    rc = _mod()
    live = {"k": {**p("1"), "conditionalValues": {"ios": {"value": "2"}}}}
    assert rc.plan(live, {"k": p("1")}, allow=set())["refused"] == ["k"]


def test_requests_ask_for_gzip_so_the_api_returns_the_etag_and_the_body_is_decoded(monkeypatch):
    # The Remote Config API sends the ETag only to a request with Accept-Encoding: gzip (found in the dry run).
    import gzip

    rc = _mod()
    seen = {}

    class Resp:
        headers = {"ETag": "etag-1", "Content-Encoding": "gzip"}

        def read(self):
            return gzip.compress(b'{"parameters": {}}')

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout):
        seen["encoding"] = req.get_header("Accept-encoding")
        return Resp()

    monkeypatch.setattr(rc.urllib.request, "urlopen", fake_urlopen)
    body, etag = rc._request("GET", rc.URL, "t")
    assert seen["encoding"] == "gzip" and etag == "etag-1" and body == {"parameters": {}}
