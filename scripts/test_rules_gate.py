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


def test_start_chat_is_banned(tmp_path):
    write(tmp_path, "web/src/ai/replanWording.ts", "const chat = model.startChat()")
    assert run_gate(tmp_path).returncode == 1


def test_slow_model_id_banned_outside_docs(tmp_path):
    write(tmp_path, "docs/LIMITS.md", "We never use gemini-3.8-flash on a live path.\n")
    assert run_gate(tmp_path).returncode == 0
    write(tmp_path, "remoteconfig.template.json", '{"clip_model": "gemini-3.8-flash"}')
    assert run_gate(tmp_path).returncode == 1


def test_binary_files_are_skipped(tmp_path):
    (tmp_path / "tiles.pmtiles").write_bytes(b"PMTiles\x00\x01import Speech\x00")
    write(tmp_path, "ok.ts", "export {}\n")
    assert run_gate(tmp_path).returncode == 0


def test_model_builders_only_in_client_files(tmp_path):
    write(tmp_path, "web/src/ai/client.ts", "export const m = getGenerativeModel(ai, opts)")
    write(tmp_path, "ios/PLS/AI/ReportReader.swift",
          "let local = SystemLanguageModel.default\nlet cloud = ai.geminiLanguageModel(name: id)\n")
    write(tmp_path, "android/app/src/main/java/app/pointlastseen/family/ai/AiClient.kt",
          "val ai = Firebase.ai(backend = b)\n")
    assert run_gate(tmp_path).returncode == 0
    strays = {
        "web/src/command/Plan.tsx": "getGenerativeModel(ai, o)",
        "ios/PLS/Views/MapStripView.swift": "SystemLanguageModel.default",
        "ios/PLS/Data/EventStore.swift": "ai.geminiLanguageModel(name: x)",
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
