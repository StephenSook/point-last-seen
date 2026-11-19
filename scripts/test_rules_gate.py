"""Tests for scripts/rules_gate.py. Each test builds a throwaway git tree."""

import subprocess
import sys
from pathlib import Path

GATE = Path(__file__).resolve().parent / "rules_gate.py"


def run_gate(root):
    root = Path(root)
    if not (root / ".git").exists():
        subprocess.run(["git", "init", "-q", str(root)], check=True)
    return subprocess.run(
        [sys.executable, "-I", str(GATE), str(root)],
        capture_output=True,
        text=True,
    )


def write(root, rel, text):
    path = Path(root) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def test_banned_import_fails(tmp_path):
    (tmp_path / "a.swift").write_text("import Speech\n")
    assert run_gate(tmp_path).returncode == 1


def test_clean_tree_passes(tmp_path):
    (tmp_path / "a.swift").write_text("import FoundationModels\n")
    assert run_gate(tmp_path).returncode == 0


def test_availability_allowed_only_in_gate(tmp_path):
    write(tmp_path, "web/src/ai/gate.ts", "LanguageModel.availability(o)")
    write(tmp_path, "web/src/ai/other.ts", "LanguageModel.availability(o)")
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "other.ts" in out.stdout and "gate.ts" not in out.stdout


def test_count_tokens_banned_in_private_paths(tmp_path):
    write(tmp_path, "web/src/ai/photoCues.ts", "await model.countTokens(x)")
    assert run_gate(tmp_path).returncode == 1
    write(tmp_path, "web/src/ai/photoCues.ts", "ok")
    write(tmp_path, "web/src/ai/sightingText.ts", "countTokens(")
    assert run_gate(tmp_path).returncode == 1


def test_walkers_file_may_not_call_math_sin(tmp_path):
    write(tmp_path, "shared/engine-ts/src/walkers.ts", "const a = Math.sin(1)")
    assert run_gate(tmp_path).returncode == 1


def test_walkers_file_may_call_math_imul(tmp_path):
    write(tmp_path, "shared/engine-ts/src/walkers.ts", "s = Math.imul(s ^ (s >>> 15), 1 | s)")
    assert run_gate(tmp_path).returncode == 0


def test_gate_floors_file_count(tmp_path):
    assert run_gate(tmp_path).returncode == 1


def test_failure_names_file_and_line(tmp_path):
    write(tmp_path, "ios/PLS/App/Reader.swift", "import SwiftUI\nimport Vision\n")
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "ios/PLS/App/Reader.swift:2" in out.stdout


def test_banned_words_are_case_insensitive_for_vendor_names(tmp_path):
    write(tmp_path, "web/src/x.ts", 'import Anthropic from "x"')
    assert run_gate(tmp_path).returncode == 1


def test_forbidden_file_names_fail(tmp_path):
    write(tmp_path, "README.md", "ok\n")
    for name in ("ios/PLS/GoogleService-Info.plist", "android/app/google-services.json",
                 ".env", ".env.production", "keys/service-account-prod.json"):
        write(tmp_path, name, "{}")
        out = run_gate(tmp_path)
        assert out.returncode == 1 and name in out.stdout, name
        (tmp_path / name).unlink()
    write(tmp_path, ".env.example", "VITE_FIREBASE_API_KEY=replace-me\n")
    assert run_gate(tmp_path).returncode == 0


def test_ignored_files_are_not_scanned(tmp_path):
    write(tmp_path, ".gitignore", "secret.txt\n")
    write(tmp_path, "secret.txt", "import Speech\n")
    write(tmp_path, "ok.ts", "export {}\n")
    assert run_gate(tmp_path).returncode == 0


def test_functions_make_no_model_call(tmp_path):
    write(tmp_path, "functions/src/draftPlan.ts", 'import { getAI } from "firebase/ai"')
    assert run_gate(tmp_path).returncode == 1
    write(tmp_path, "functions/src/draftPlan.ts", "await model.generateContent(x)")
    assert run_gate(tmp_path).returncode == 1
    write(tmp_path, "functions/src/draftPlan.ts", "export const ok = 1")
    assert run_gate(tmp_path).returncode == 0


def test_functions_may_host_the_ai_logic_trigger_but_not_call_a_model(tmp_path):
    # cloudGuard is a beforeGenerateContent trigger: it names the event and calls no model.
    write(tmp_path, "functions/src/index.ts",
          'import { beforeGenerateContent } from "firebase-functions/v2/ai";\n'
          "// every generateContent call is checked\n"
          "export const guard = beforeGenerateContent(e => undefined);")
    assert run_gate(tmp_path).returncode == 0
    for call in ("await model.generateContent(x)", "model.generateContentStream (x)"):
        write(tmp_path, "functions/src/index.ts", call)
        assert run_gate(tmp_path).returncode == 1, call


def test_shipped_code_reaches_models_only_through_firebase_ai_logic(tmp_path):
    # Review: a direct call to a model host (Google's Gemini API, Vertex AI REST, OpenAI, Anthropic, Ollama,
    # Hume and the like) would bypass App Check, auth mode, the per-user limit and cloudGuard.
    planted = {
        "web/src/ai/direct.ts": 'await fetch("https://generativelanguage.googleapis.com/v1beta/models/x:generateContent")',
        "ios/PLS/AI/Direct.swift": 'let url = URL(string: "https://api.openai.com/v1/chat/completions")',
        "android/app/src/main/java/app/pointlastseen/family/ai/Direct.kt": 'val host = "http://localhost:11434/api/generate"',
        "functions/src/direct.ts": 'import Anthropic from "@anthropic-ai/sdk";',
        "web/src/ai/voice.ts": 'const ws = new WebSocket("wss://api.hume.ai/v0/evi/chat");',
        "web/src/ai/vertex.ts": 'fetch("https://us-central1-aiplatform.googleapis.com/v1/projects/p")',
    }
    for path, line in planted.items():
        root = tmp_path / path.replace("/", "_")
        root.mkdir()
        write(root, path, line)
        assert run_gate(root).returncode == 1, path
    clean = tmp_path / "clean"
    clean.mkdir()
    write(clean, "web/src/ai/hosts.ts", 'const host = "firebasevertexai.googleapis.com";')
    write(clean, "docs/LIMITS.md", "We never call api.openai.com or Ollama.")
    write(clean, "web/src/ai/direct.test.ts", 'expect(url).not.toContain("generativelanguage.googleapis.com")')
    assert run_gate(clean).returncode == 0


def test_start_chat_is_banned(tmp_path):
    write(tmp_path, "web/src/ai/replanWording.ts", "const chat = model.startChat()")
    assert run_gate(tmp_path).returncode == 1


def test_slow_model_id_banned_outside_docs(tmp_path):
    write(tmp_path, "docs/LIMITS.md", "We never use gemini-3.8-flash on a live path.\n")
    assert run_gate(tmp_path).returncode == 0
    write(tmp_path, "remoteconfig.template.json", '{"clip_model": "gemini-3.8-flash"}')
    assert run_gate(tmp_path).returncode == 1


def test_slow_model_ban_matches_the_whole_id_only(tmp_path):
    # gemini-3.8-flash is banned; the TTS ids that start with the same text are different models.
    write(tmp_path, "shared/constants/models.json", '{"models": [{"id": "gemini-3.8-flash-lite-tts"}], "banned": []}')
    write(tmp_path, "remoteconfig.template.json", '{"tts_model_ios": "gemini-3.8-flash-lite-tts"}')
    assert run_gate(tmp_path).returncode == 0
    write(tmp_path, "web/src/ai/x.ts", 'const m = "gemini-3.8-flash";\n')
    assert run_gate(tmp_path).returncode == 1


def test_binary_files_are_skipped(tmp_path):
    (tmp_path / "tiles.pmtiles").write_bytes(b"PMTiles\x00\x01import Speech\x00")
    write(tmp_path, "ok.ts", "export {}\n")
    assert run_gate(tmp_path).returncode == 0


def test_model_builders_only_in_client_files(tmp_path):
    write(tmp_path, "web/src/ai/client.ts", "export const m = getGenerativeModel(ai, opts)")
    write(tmp_path, "ios/PLS/AI/ModelSessionFactory.swift",
          "let local = SystemLanguageModel.default\nlet cloud = ai.geminiLanguageModel(name: id)\n")
    write(tmp_path, "ios/PLS/AI/AIClient.swift", "let ai = FirebaseAI.firebaseAI(app: app, backend: b)\n")
    write(tmp_path, "android/app/src/main/java/app/pointlastseen/family/ai/AiClient.kt",
          "val ai = Firebase.ai(backend = b)\n")
    assert run_gate(tmp_path).returncode == 0
    strays = {
        "web/src/command/Plan.tsx": "getGenerativeModel(ai, o)",
        "ios/PLS/Views/MapStripView.swift": "SystemLanguageModel.default",
        "ios/PLS/Data/EventStore.swift": "ai.geminiLanguageModel(name: x)",
        "ios/PLS/AI/ReportReader.swift": "FirebaseAI.firebaseAI(app: app)",
        "android/app/src/main/java/app/pointlastseen/family/ui/Home.kt": "Firebase.ai(backend = b)",
    }
    for rel, text in strays.items():
        write(tmp_path, rel, text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and rel in out.stdout, rel
        (tmp_path / rel).unlink()
    write(tmp_path, "docs/ARCHITECTURE.md", "The web client calls getGenerativeModel( once.\n")
    assert run_gate(tmp_path).returncode == 0


def test_model_builder_floor_catches_a_moved_builder(tmp_path):
    write(tmp_path, "web/src/ai/client.ts", "export const nothing = 1")
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "web/src/ai/client.ts" in out.stdout


def test_storage_token_urls_are_banned_in_client_code(tmp_path):
    # A download URL carries a token that bypasses Storage rules, so a URL saved before a judge sandbox
    # expires would still serve the clip afterwards. Client reads go through getBytes/getBlob instead.
    write(tmp_path, "web/src/ok.ts", "const bytes = await getBytes(ref(storage, path))\n")
    assert run_gate(tmp_path).returncode == 0
    for rel, text in [("web/src/camera/Clip.tsx", "const url = await getDownloadURL(r)"),
                      ("ios/PLS/Data/Media.swift", "ref.downloadURL { url, err in }"),
                      ("android/app/src/main/java/app/pointlastseen/family/data/Media.kt", "ref.downloadUrl.addOnSuccessListener { }")]:
        write(tmp_path, rel, text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and rel in out.stdout, rel
        (tmp_path / rel).unlink()
    write(tmp_path, "docs/LIMITS.md", "The apps never call getDownloadURL.\n")
    assert run_gate(tmp_path).returncode == 0


def test_availability_ban_covers_optional_chaining_and_brackets(tmp_path):
    write(tmp_path, "web/src/ai/gate.ts", "LanguageModel?.availability(o)")
    assert run_gate(tmp_path).returncode == 0
    for text in ("window.LanguageModel?.availability(o)", 'LanguageModel["availability"](o)', "LanguageModel ?. availability(o)"):
        write(tmp_path, "web/src/ai/other.ts", text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and "other.ts" in out.stdout, text


def test_docs_may_name_the_availability_call(tmp_path):
    write(tmp_path, "CHANGELOG.md", "The gate keeps `LanguageModel?.availability` in web/src/ai/gate.ts.\n")
    assert run_gate(tmp_path).returncode == 0


def test_licensed_font_names_are_banned_outside_docs(tmp_path):
    # Task 39: only the OFL fonts in web/public/fonts ship; a stray reference to a commercial face fails.
    write(tmp_path, "web/src/styles/type.css", "body { font-family: 'Berkeley Mono', monospace; }\n")
    write(tmp_path, "web/src/clock.tsx", "const f = 'digital-7';\n")
    write(tmp_path, "docs/design.md", "We do not use Berkeley Mono or Digital-7.\n")
    out = run_gate(tmp_path)
    assert out.returncode == 1
    assert "web/src/styles/type.css:1" in out.stdout and "web/src/clock.tsx:1" in out.stdout
    assert "docs/design.md" not in out.stdout


def test_animejs_is_imported_only_by_the_motion_engine(tmp_path):
    write(tmp_path, "web/src/motion/engine.ts", 'import { animate } from "animejs";\n')
    write(tmp_path, "web/src/command/Card.tsx", "import { animate } from 'animejs';\n")
    write(tmp_path, "web/src/other.ts", 'const m = await import("animejs/timeline");\n')
    write(tmp_path, "web/package.json", '{"dependencies": {"animejs": "4.5.0"}}\n')
    out = run_gate(tmp_path)
    assert out.returncode == 1
    assert "web/src/command/Card.tsx:1" in out.stdout and "web/src/other.ts:1" in out.stdout
    assert "web/src/motion/engine.ts:1" not in out.stdout and "web/package.json" not in out.stdout


def test_no_remote_font_host_in_the_web_page_or_css(tmp_path):
    write(tmp_path, "web/index.html", '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">\n')
    write(tmp_path, "web/src/styles/fonts.css", "@import url('https://use.typekit.net/abc.css');\n")
    write(tmp_path, "web/src/styles/local.css", "@font-face { src: url('/fonts/dinish/DINish-Regular.woff2'); }\n")
    out = run_gate(tmp_path)
    assert out.returncode == 1
    assert "web/index.html:1" in out.stdout and "web/src/styles/fonts.css:1" in out.stdout
    assert "local.css" not in out.stdout


MODELS = '{"models": [{"id": "gemini-3.5-flash-lite"}], "banned": [{"id": "gemini-3.1-flash-tts-preview"}]}'


def test_model_ids_in_source_must_be_on_the_allow_list(tmp_path):
    write(tmp_path, "shared/constants/models.json", MODELS)
    write(tmp_path, "web/src/config/rc.ts", 'cloud_model_web: "gemini-3.5-flash-lite",\n')
    write(tmp_path, "ios/PLS/Config/Values.swift", 'let m = "gemini-3.6-flash-lite"\n')
    write(tmp_path, "web/src/config/rc.test.ts", 'parseRc({ cloud_model_web: "gemini-3.6-flash-lite" })\n')
    write(tmp_path, "docs/models.md", "We tried gemini-3.6-flash-lite once.\n")
    out = run_gate(tmp_path)
    assert out.returncode == 1
    assert "ios/PLS/Config/Values.swift:1" in out.stdout
    assert "rc.ts:1" not in out.stdout and "rc.test.ts" not in out.stdout and "models.md" not in out.stdout


def test_a_model_shut_down_before_judging_ends_fails_even_in_tests(tmp_path):
    write(tmp_path, "shared/constants/models.json", MODELS)
    write(tmp_path, "android/app/src/test/java/TtsTest.kt", 'val m = "gemini-3.1-flash-tts-preview"\n')
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "TtsTest.kt:1" in out.stdout


def test_without_git_it_walks_the_files_on_disk_and_still_gates(tmp_path):
    # A ZIP download has no .git: the gate says so and checks the files on disk, skipping dependency folders.
    def gate():
        return subprocess.run([sys.executable, "-I", str(GATE), str(tmp_path)], capture_output=True, text=True)
    (tmp_path / "a.swift").write_text("import FoundationModels\n")
    write(tmp_path, "node_modules/pkg/b.swift", "import Speech\n")
    clean = gate()
    assert clean.returncode == 0, clean.stdout
    assert "not a git checkout" in clean.stdout
    (tmp_path / "c.swift").write_text("import Speech\n")
    assert gate().returncode == 1
