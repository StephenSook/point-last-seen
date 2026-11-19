"""App Check control for Firebase AI Logic on the deployed project.

Full mode (local): a raw generateContent call with no App Check token must be refused with 401
"Firebase App Check token is invalid."; only then is a limited-use token taken from the debug token, and a
call with it must answer 200. Replay protection is enforced on AI Logic, so the same token used a second time
must be refused with 401.
Writes status codes and reasons (never a key or token) to docs/evidence/appcheck-control/<time>.json.

--no-token-only (the daily probe): only the refusal half; no model call, no secret. The config comes from
the deployed site's /__/firebase/init.json. Exits 1 loudly if the call is not refused for App Check.

--ci (the daily probe's positive read): the full control with the debug token from the environment variable
APPCHECK_DEBUG_TOKEN_CI instead of the Keychain; no evidence file. Without that variable it fails with a clear
message and makes no call (the repository secret exists since 2026-11-18, so a missing one is a fault). Model calls sign in anonymously first (AI Logic's authenticated-users mode needs a
Firebase ID token) and the throwaway user deletes itself afterwards. No token or key is ever printed.

Usage: python3 -I scripts/appcheck_control.py [--no-token-only | --ci]
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

# PLS_SITE is the wrong-URL control: a manual run pointed at another site must fail. Empty means the real site.
SITE = os.environ.get("PLS_SITE") or "https://buildhybridai-2026-yg3m.web.app"
MODEL = "gemini-3.5-flash-lite"
REFUSAL = "Firebase App Check token is invalid."
WEB_APP_ID = "1:593239421521:web:5aeaabe9c07bf3db587e70"  # public; init.json has no appId
RETIRE_AFTER = date(2026, 12, 17)  # judging ends 2026-12-16
PROMPT = {"contents": [{"role": "user", "parts": [{"text": "Reply with the single word ok."}]}], "generationConfig": {"maxOutputTokens": 8}}


def control_passed(no_token_status, with_token_status) -> bool:
    return no_token_status == 401 and with_token_status == 200


def debug_token(argv: list[str], env) -> str | None:
    """The CI token from the environment with --ci (None when absent), else the local Keychain item."""
    if "--ci" in argv:
        return env.get("APPCHECK_DEBUG_TOKEN_CI") or None
    return subprocess.run(["security", "find-generic-password", "-s", "pls-appcheck-debug-token-web", "-w"],
                          capture_output=True, text=True, check=True).stdout.strip()


def model_headers(api_key: str, app_check: str, id_token: str) -> dict:
    return {"x-goog-api-key": api_key, "X-Firebase-AppCheck": app_check, "Authorization": f"Firebase {id_token}"}


def exchange_body(debug_token: str) -> dict:
    """AI Logic enforces replay protection, so the control asks for a limited-use (one-call) token."""
    return {"debugToken": debug_token, "limitedUse": True}


def full_control_passed(no_token_status, no_token_refused, first_status, first_answered, replay_status) -> bool:
    """No token: the App Check refusal. A fresh limited-use token: a real answer. The same token again: 401."""
    return (no_token_refused and control_passed(no_token_status, first_status) and first_answered is True
            and replay_status == 401)


def refused_for_app_check(status, body) -> bool:
    err = (body or {}).get("error", {}) if isinstance(body, dict) else {}
    return status == 401 and err.get("status") == "UNAUTHENTICATED" and err.get("message") == REFUSAL


def answered(body) -> bool:
    """A 200 counts only with a non-empty answer: a model that returns {} or no text has not really answered."""
    try:
        parts = body["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        return False
    return any(isinstance(p, dict) and isinstance(p.get("text"), str) and p["text"].strip() != "" for p in parts)


def redact(text: str, secrets: list[str]) -> str:
    for s in secrets:
        if s:
            text = text.replace(s, "<REDACTED>")
    return text


def config_from_init(init: dict) -> dict:
    return {k: init[k] for k in ("apiKey", "projectId")}


def retired(today: date) -> bool:
    return today > RETIRE_AFTER


def post(url: str, body: dict, headers: dict):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Referer": SITE + "/", **headers})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}


def summary(body) -> dict:
    err = body.get("error", {}) if isinstance(body, dict) else {}
    return {"status": err.get("status"), "message": err.get("message")}


def main(argv: list[str]) -> int:
    no_token_only, ci = "--no-token-only" in argv, "--ci" in argv
    if (no_token_only or ci) and retired(datetime.now(timezone.utc).date()):
        print(f"appcheck_control: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    if ci and debug_token(argv, os.environ) is None:
        print("appcheck_control: FAIL, no CI token (APPCHECK_DEBUG_TOKEN_CI is not set); the positive read cannot run")
        return 1
    with urllib.request.urlopen(SITE + "/__/firebase/init.json", timeout=30) as r:
        cfg = config_from_init(json.loads(r.read()))
    gen = f"https://firebasevertexai.googleapis.com/v1beta/projects/{cfg['projectId']}/models/{MODEL}:generateContent"
    record = {"ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "projectId": cfg["projectId"], "model": MODEL,
              "referer": SITE + "/"}
    s0, b0 = post(gen, PROMPT, {"x-goog-api-key": cfg["apiKey"]})
    record["noToken"] = {"status": s0, "error": summary(b0)}
    refused = refused_for_app_check(s0, b0)
    secrets = [cfg["apiKey"]]
    if no_token_only:
        print(redact(json.dumps(record), secrets))
        if not refused:
            print(f"appcheck_control: FAIL: a call with no App Check token got HTTP {s0}, not the App Check refusal")
            return 1
        print("appcheck_control: ok, a call with no App Check token is refused for App Check")
        return 0
    with_status, first_answered, replay_status = None, False, None
    if refused:
        debug = debug_token(argv, os.environ) or ""
        secrets.append(debug)
        su, up = post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={cfg['apiKey']}", {"returnSecureToken": True}, {})
        id_token = up.get("idToken", "") if isinstance(up, dict) else ""
        secrets.append(id_token)
        record["signIn"] = su
        s1, b1 = post(f"https://content-firebaseappcheck.googleapis.com/v1/projects/{cfg['projectId']}/apps/{WEB_APP_ID}:exchangeDebugToken?key={cfg['apiKey']}",
                      exchange_body(debug), {})
        record["exchangeStatus"] = s1
        token = b1.get("token", "") if isinstance(b1, dict) else ""
        secrets.append(token)
        if token:
            headers = model_headers(cfg["apiKey"], token, id_token)
            s2, b2 = post(gen, PROMPT, headers)
            with_status, first_answered = s2, answered(b2)
            record["withToken"] = ({"status": 200, "answered": first_answered, "modelVersion": b2.get("modelVersion")} if s2 == 200
                                   else {"status": s2, "error": summary(b2)})
            s3, b3 = post(gen, PROMPT, headers)
            replay_status = s3
            record["replay"] = {"status": s3, "error": summary(b3)} if s3 != 200 else {"status": 200, "answered": answered(b3)}
        if id_token:
            sd, _ = post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={cfg['apiKey']}", {"idToken": id_token}, {})
            record["throwawayUserDeleted"] = sd == 200
    else:
        record["withToken"] = "not run: the call without a token was not refused for App Check"
    record["passed"] = full_control_passed(s0, refused, with_status, first_answered, replay_status)
    if ci:
        print(redact(json.dumps(record), secrets))
        print("appcheck_control: ok, positive read passed" if record["passed"] else "appcheck_control: FAIL: positive read did not pass")
        return 0 if record["passed"] else 1
    out = Path(__file__).resolve().parents[1] / "docs/evidence/appcheck-control"
    out.mkdir(parents=True, exist_ok=True)
    text = redact(json.dumps(record, indent=2), secrets) + "\n"
    path = out / (record["ranAt"].replace(":", "-") + ".json")
    path.write_text(text)
    print(text + f"wrote {path.relative_to(out.parents[2])}")
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
