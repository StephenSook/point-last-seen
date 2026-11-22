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


def test_speech_recognition_is_banned_on_every_platform(tmp_path):
    # Recognition reads the user's speech with a model outside Firebase AI Logic, so no platform may use it.
    for rel, text in (("ios/PLS/A.swift", "let r = SFSpeechRecognizer()"),
                      ("android/app/src/main/A.kt", "SpeechRecognizer.createSpeechRecognizer(ctx)"),
                      ("android/app/src/main/B.kt", "Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)"),
                      ("android/app/src/main/C.kt", 'Intent("android.speech.action.RECOGNIZE_SPEECH")'),
                      ("web/src/a.ts", "new webkitSpeechRecognition()"),
                      ("web/src/b.ts", "new SpeechRecognition()")):
        write(tmp_path, rel, text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and rel in out.stdout, rel
        write(tmp_path, rel, "ok")


def test_system_text_to_speech_is_allowed_as_the_fallback_voice(tmp_path):
    # The system voice speaks text the app already holds; it reads nothing from the user.
    write(tmp_path, "ios/PLS/A.swift", "import AVFoundation\nlet s = AVSpeechSynthesizer()")
    write(tmp_path, "android/app/src/main/A.kt", "import android.speech.tts.TextToSpeech")
    write(tmp_path, "web/src/a.ts", "window.speechSynthesis.speak(new SpeechSynthesisUtterance(t))")
    assert run_gate(tmp_path).returncode == 0


SEED_TS = 'export const JUDGE_SEED_INCIDENT = "drill-seed-1";\n'


def test_live_and_device_tests_never_name_the_judge_seed(tmp_path):
    # Review: live tests wrote a test stamp into the drill every judge practice search is copied from. The seed id
    # is read from the function, so a renamed seed is still guarded.
    write(tmp_path, "functions/src/judgeSession.ts", SEED_TS)
    for rel, text in (("android/app/src/androidTest/java/x/LiveTest.kt", 'const val INCIDENT = "drill-seed-1"'),
                      ("android/run-drill-e2e.sh", "incident=drill-seed-1"),
                      ("web/e2e/smoke.spec.ts", 'await join(page, "drill-seed-1")'),
                      ("ios/PLSUITests/JoinUITests.swift", 'let incident = "drill-seed-1"')):
        write(tmp_path, rel, text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and rel in out.stdout and "drill-test-1" in out.stdout, rel
        write(tmp_path, rel, "ok")


def test_the_seed_may_appear_in_docs_unit_tests_and_functions_and_other_ids_pass(tmp_path):
    write(tmp_path, "functions/src/judgeSession.ts", SEED_TS)
    write(tmp_path, "android/E2E.md", "The judge seed drill-seed-1 is never a test target.")
    write(tmp_path, "android/app/src/test/java/x/PushTest.kt", 'teamTopic("drill-seed-1", "T1")')
    write(tmp_path, "web/src/data/practice.test.ts", 'expect(id).not.toBe("drill-seed-1")')
    write(tmp_path, "functions/test/judgeSession.test.ts", 'seedIncidentId: "drill-seed-1"')
    write(tmp_path, "web/e2e/smoke.spec.ts", 'await join(page, "drill-test-1"); const other = "drill-seed-10";')
    assert run_gate(tmp_path).returncode == 0


def test_the_shared_seed_constant_must_name_the_functions_seed_and_a_different_test_drill(tmp_path):
    # shared/constants/judge-seed.json is what the web's live fixtures read; it must agree with the function.
    write(tmp_path, "functions/src/judgeSession.ts", SEED_TS)
    seed = lambda inc, test: '{"incidentId": "%s", "testIncidentId": "%s"}' % (inc, test)
    write(tmp_path, "shared/constants/judge-seed.json", seed("drill-seed-1", "drill-test-1"))
    assert run_gate(tmp_path).returncode == 0
    for bad in (seed("drill-other", "drill-test-1"), seed("drill-seed-1", "drill-seed-1"), "{}"):
        write(tmp_path, "shared/constants/judge-seed.json", bad)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and "judge-seed.json" in out.stdout, bad


def test_a_seed_constant_the_gate_cannot_read_fails(tmp_path):
    write(tmp_path, "functions/src/judgeSession.ts", "export const SEED = 1;\n")
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "JUDGE_SEED_INCIDENT" in out.stdout


def test_clean_tree_passes(tmp_path):
    (tmp_path / "a.swift").write_text("import FoundationModels\n")
    assert run_gate(tmp_path).returncode == 0


def test_availability_allowed_only_in_gate(tmp_path):
    write(tmp_path, "web/src/ai/gate.ts", "LanguageModel.availability(o)")
    write(tmp_path, "web/src/ai/other.ts", "LanguageModel.availability(o)")
    out = run_gate(tmp_path)
    assert out.returncode == 1 and "other.ts" in out.stdout and "gate.ts" not in out.stdout


def test_web_code_never_creates_a_built_in_model_session_itself(tmp_path):
    # Review: the web reaches the browser's model only through Firebase AI Logic's hybrid mode.
    for text in ("const s = await LanguageModel.create(opts)", "LanguageModel?.create(o)", 'LanguageModel["create"](o)'):
        write(tmp_path, "web/src/ai/other.ts", text)
        assert run_gate(tmp_path).returncode == 1, text


def test_web_code_never_prompts_a_built_in_model_session_itself(tmp_path):
    for text in ("await session.prompt(x)", "await s?.prompt(x)", 'await s["prompt"](x)'):
        write(tmp_path, "web/src/ai/other.ts", text)
        assert run_gate(tmp_path).returncode == 1, text


def test_web_code_never_streams_a_built_in_model_session_itself(tmp_path):
    for text in ("for await (const c of session.promptStreaming(x)) {}", 's["promptStreaming"](x)'):
        write(tmp_path, "web/e2e/harness/x.spec.ts", text)
        assert run_gate(tmp_path).returncode == 1, text


def test_chrome_built_in_ai_apis_and_prompt_calls_fail_outside_tests(tmp_path):
    # All inference goes through Firebase AI Logic: Chrome's other built-in AI APIs are banned in shipped code, and a
    # session is never prompted by hand on any platform.
    for rel, text in (("web/src/ai/a.ts", "const t = await Translator.create(o)"),
                      ("web/src/ai/b.ts", "await LanguageDetector.availability()"),
                      ("web/src/ai/c.ts", "const s = await Summarizer.create()"),
                      ("web/src/ai/d.ts", "const w = await Writer.create()"),
                      ("web/src/ai/e.ts", "const r = await Rewriter.create()"),
                      ("web/src/ai/f.ts", "const p = await Proofreader.create()"),
                      ("android/app/src/main/A.kt", "val reply = session.prompt(note)"),
                      ("functions/src/a.ts", "for await (const c of s.promptStreaming(x)) {}")):
        write(tmp_path, rel, text)
        out = run_gate(tmp_path)
        assert out.returncode == 1 and rel in out.stdout, rel
        write(tmp_path, rel, "ok")


def test_chrome_built_in_ai_names_pass_in_docs_tests_and_longer_words(tmp_path):
    write(tmp_path, "web/README.md", "We never call Translator, Summarizer, Writer or session.prompt( directly.")
    write(tmp_path, "android/app/src/test/java/x/PromptTest.kt", 'val bytes = FamilyNote.prompt("x").length')
    write(tmp_path, "web/src/ai/gate.test.ts", "expect(globalThis.Translator).toBeUndefined()")
    write(tmp_path, "android/app/src/main/A.kt", "val w = PrintWriter(out); val s = buildPromptText(note)")
    write(tmp_path, "functions/src/a.ts", "type Config = { writer?: () => Writer };")
    write(tmp_path, "web/src/a.ts", "const translatorNote = 'a translator'")
    assert run_gate(tmp_path).returncode == 0


def test_built_in_model_calls_may_be_named_in_docs_and_other_platforms_are_not_web(tmp_path):
    write(tmp_path, "web/README.md", "We never call LanguageModel.create or session.prompt( directly.")
    write(tmp_path, "ios/PLS/A.swift", "let r = try await session.respond(to: p)")
    write(tmp_path, "web/src/ai/client.ts", "const m = getGenerativeModel(ai, { mode: 'prefer_on_device' })")
    assert run_gate(tmp_path).returncode == 0


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
