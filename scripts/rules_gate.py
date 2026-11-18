#!/usr/bin/env python3
"""Repository rules gate.

Walks every file git would ship (tracked plus untracked-but-not-ignored) and
fails with `path:line: reason` on any rule from the plan's Global Constraints.
Exit 0 when clean, 1 on any violation or when the walk finds zero files.

Usage: python3 -I scripts/rules_gate.py [root]
"""

import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

SELF_PATHS = ("scripts/rules_gate.py", "scripts/test_rules_gate.py")

# Model and speech paths outside Firebase AI Logic. Case-sensitive tokens.
BANNED_EXACT = (
    "import Speech",
    "SFSpeechRecognizer",
    "import Vision",
    "CoreML",
    "webkitSpeechRecognition",
    "TextDetector",
    "BarcodeDetector",
    "startChat",
)
# Vendor and library names, matched case-insensitively.
BANNED_ANYCASE = ("tflite", "mediapipe", "onnx", "anthropic", "elevenlabs", "opencv")

AVAILABILITY_ONLY_IN = "web/src/ai/gate.ts"
COUNT_TOKENS_BANNED_IN = ("web/src/ai/photoCues.ts", "web/src/ai/sightingText.ts")
WALKERS_FILE = "shared/engine-ts/src/walkers.ts"
SLOW_MODEL = "gemini-3.8-flash"
FUNCTION_MODEL_CALLS = ("firebase/ai", "@google/genai", "@google/generative-ai",
                        "generateContent", "getGenerativeModel")

FORBIDDEN_NAMES = re.compile(
    r"(^|/)(GoogleService-Info\.plist|google-services\.json|service-account[^/]*\.json)$"
)
ENV_FILE = re.compile(r"(^|/)\.env(\..+)?$")

# Model builders live only in their named client files (code files; docs exempt).
# A builder token that appears nowhere in an existing client file means the
# builder moved and this list is stale, so that fails too (the floor).
MODEL_BUILDERS = {
    "getGenerativeModel(": ("web/src/ai/client.ts",),
    "geminiLanguageModel(": ("ios/PLS/AI/ModelSessionFactory.swift",),
    "SystemLanguageModel": ("ios/PLS/AI/ModelSessionFactory.swift",),
    "FirebaseAI.firebaseAI(": ("ios/PLS/AI/AIClient.swift",),
    "Firebase.ai(": ("android/app/src/main/java/app/pointlastseen/family/ai/AiClient.kt",),
}
# A Storage download URL carries a token that bypasses Storage rules (a URL saved before a judge sandbox
# expires would keep serving its clip). Client code reads media with getBytes/getBlob instead.
TOKEN_URL = re.compile(r"\b(getDownloadURL|downloadURL|downloadUrl)\b")
CLIENT_DIRS = ("web/", "ios/", "android/")

# Plain, optional-chained (?.) and bracket ("availability") access all count.
AVAILABILITY = re.compile(r"(?<!System)LanguageModel\s*(?:\?\s*)?(?:\.\s*availability\b|\[\s*[\"']availability[\"']\s*\])")

# Task 39 type and motion: only the OFL fonts in web/public/fonts ship, the motion library sits behind one
# module, and no font is fetched from a remote host.
FONT_NAMES = re.compile(r"berkeley\s*mono|digital-7", re.IGNORECASE)
ANIMEJS_ONLY_IN = "web/src/motion/engine.ts"
ANIMEJS_IMPORT = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']animejs(?:/[^"']*)?["']""")
REMOTE_FONT_HOSTS = re.compile(r"fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|p\.typekit\.net|"
                               r"fonts\.bunny\.net|fast\.fonts\.net|fonts\.cdnfonts\.com|fonts\.adobe\.com")
# Model ids: every id named in source must be on shared/constants/models.json (read from the live models page
# with a date); an id whose shutdown falls before judging ends fails anywhere outside docs, tests included.
MODEL_ID = re.compile(r"\bgemini-[0-9][A-Za-z0-9._-]*[A-Za-z0-9]")
MODELS_FILE = "shared/constants/models.json"
TEST_PATH = re.compile(r"(^|/)(test|tests|__tests__|androidTest)/|[A-Za-z]+Tests?/|\.(test|spec)\.[jt]sx?$|(^|/)test_[^/]+\.py$|Tests?\.(kt|swift)$")
MATH_CALL = re.compile(r"\bMath\.(?!imul\b)[A-Za-z_]\w*")
ANYCASE = re.compile("|".join(re.escape(w) for w in BANNED_ANYCASE), re.IGNORECASE)


def list_files(root: Path) -> list[str]:
    cmd = ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others",
           "--exclude-standard", "--", "."]
    cmd += [f":(exclude){p}" for p in SELF_PATHS]
    out = subprocess.run(cmd, capture_output=True, check=True)
    return sorted({p for p in out.stdout.decode().split("\0") if p})


def read_text(path: Path) -> str | None:
    try:
        data = path.read_bytes()
    except (FileNotFoundError, IsADirectoryError):
        return None
    if b"\0" in data:
        return None
    return data.decode("utf-8", errors="replace")


def check_name(rel: str) -> list[str]:
    if FORBIDDEN_NAMES.search(rel):
        return [f"{rel}:0: file must never be committed"]
    m = ENV_FILE.search(rel)
    if m and PurePosixPath(rel).name != ".env.example":
        return [f"{rel}:0: env file must never be committed (only .env.example)"]
    return []


def check_lines(rel: str, text: str, models: tuple[set[str], set[str]] = (set(), set())) -> list[str]:
    problems = []
    allowed_models, banned_models = models
    is_test = bool(TEST_PATH.search(rel))
    is_doc = rel.endswith(".md")
    in_functions = rel.startswith("functions/")
    for n, line in enumerate(text.splitlines(), start=1):
        def bad(reason):
            problems.append(f"{rel}:{n}: {reason}")

        for token in BANNED_EXACT:
            if token in line:
                bad(f"banned token '{token}'")
        m = ANYCASE.search(line)
        if m:
            bad(f"banned name '{m.group(0)}'")
        if not is_doc and AVAILABILITY.search(line) and rel != AVAILABILITY_ONLY_IN:
            bad("LanguageModel.availability is allowed only in the web AI gate module")
        if rel in COUNT_TOKENS_BANNED_IN and "countTokens" in line:
            bad("countTokens is banned in private-data paths")
        if rel == WALKERS_FILE:
            m = MATH_CALL.search(line)
            if m:
                bad(f"walkers.ts may use only integer PRNG steps and + - * / compare, found '{m.group(0)}'")
        if SLOW_MODEL in line and not is_doc:
            bad(f"model id '{SLOW_MODEL}' is banned on any live path")
        if not is_doc and rel.startswith(CLIENT_DIRS):
            m = TOKEN_URL.search(line)
            if m:
                bad(f"Storage token URL '{m.group(0)}' bypasses Storage rules; read with getBytes/getBlob")
        if not is_doc:
            for token, allowed in MODEL_BUILDERS.items():
                if token in line and rel not in allowed:
                    bad(f"model builder '{token}' belongs only in its client file")
        if not is_doc:
            m = FONT_NAMES.search(line)
            if m:
                bad(f"font '{m.group(0)}' is not one of the shipped OFL fonts")
            if ANIMEJS_IMPORT.search(line) and rel != ANIMEJS_ONLY_IN:
                bad(f"animejs is imported only by {ANIMEJS_ONLY_IN}")
        if (rel == "web/index.html" or (rel.startswith("web/") and rel.endswith((".css", ".scss")))) and REMOTE_FONT_HOSTS.search(line):
            bad("fonts load only from web/public/fonts, never a remote host")
        if not is_doc and rel != MODELS_FILE and (allowed_models or banned_models):
            for mid in MODEL_ID.findall(line):
                if mid in banned_models:
                    bad(f"model '{mid}' shuts down before judging ends ({MODELS_FILE})")
                elif not is_test and mid not in allowed_models and mid != SLOW_MODEL:
                    bad(f"model '{mid}' is not on the allow-list in {MODELS_FILE}")
        if in_functions:
            for token in FUNCTION_MODEL_CALLS:
                if token in line:
                    bad(f"no model call in any Cloud Function, found '{token}'")
    return problems


def check_builder_floor(root: Path, files: list[str]) -> list[str]:
    problems = []
    present = set(files)
    for token, allowed in MODEL_BUILDERS.items():
        existing = [rel for rel in allowed if rel in present]
        if not existing:
            continue
        texts = [read_text(root / rel) or "" for rel in existing]
        if not any(token in t for t in texts):
            problems.append(f"{existing[0]}:0: client file has no '{token}'; the builder moved, update the gate")
    return problems


def main(root: str) -> int:
    root_path = Path(root).resolve()
    try:
        files = list_files(root_path)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"rules_gate: cannot list files under {root_path}: {exc}")
        return 1
    if not files:
        print("rules_gate: walked 0 files; refusing to report clean")
        return 1
    problems = []
    models: tuple[set[str], set[str]] = (set(), set())
    mf = root_path / MODELS_FILE
    if mf.exists():
        m = json.loads(mf.read_text())
        models = ({x["id"] for x in m.get("models", [])}, {x["id"] for x in m.get("banned", [])})
    for rel in files:
        problems += check_name(rel)
        text = read_text(root_path / rel)
        if text is not None:
            problems += check_lines(rel, text, models)
    problems += check_builder_floor(root_path, files)
    for p in problems:
        print(p)
    status = "FAIL" if problems else "ok"
    print(f"rules_gate: {status}, {len(files)} files walked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
