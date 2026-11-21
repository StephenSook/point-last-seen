"""Tests for scripts/check_privacy_label.py: the App Store privacy label must cover every privacy manifest an
iPhone build bundles (the app's own and each SDK's), and the app's own manifest must declare the whole label."""
import json
import plistlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "check_privacy_label.py"
LABEL = ROOT / "ios" / "app-privacy-label.json"
APP_MANIFEST = ROOT / "ios" / "PLS" / "PrivacyInfo.xcprivacy"


def manifest(types):
    return {
        "NSPrivacyTracking": False,
        "NSPrivacyTrackingDomains": [],
        "NSPrivacyAccessedAPITypes": [],
        "NSPrivacyCollectedDataTypes": [
            {
                "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataType" + name,
                "NSPrivacyCollectedDataTypeLinked": linked,
                "NSPrivacyCollectedDataTypeTracking": tracking,
                "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurpose" + p for p in purposes],
            }
            for name, linked, tracking, purposes in types
        ],
    }


def app_dir(tmp, app_types, sdk_types):
    app = tmp / "PLS.app"
    (app / "Sdk.bundle").mkdir(parents=True)
    with open(app / "PrivacyInfo.xcprivacy", "wb") as f:
        plistlib.dump(manifest(app_types), f)
    with open(app / "Sdk.bundle" / "PrivacyInfo.xcprivacy", "wb") as f:
        plistlib.dump(manifest(sdk_types), f)
    return app


def label(tmp, types):
    path = tmp / "label.json"
    path.write_text(json.dumps({"tracking": False, "types": {n: {"linked": l, "purposes": p} for n, l, p in types}}))
    return path


def run(app, label_path):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), str(app), str(label_path)], capture_output=True, text=True)


APP = [("UserID", True, False, ["AppFunctionality"])]
LABEL_OK = [("UserID", True, ["AppFunctionality"]), ("CrashData", False, ["AppFunctionality"])]


def test_a_label_that_covers_every_manifest_passes(tmp_path):
    app = app_dir(tmp_path, APP + [("CrashData", False, False, ["AppFunctionality"])], [("CrashData", False, False, ["AppFunctionality"])])
    r = run(app, label(tmp_path, LABEL_OK))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "2 manifests" in r.stdout


def test_a_type_an_sdk_collects_must_be_on_the_label(tmp_path):
    app = app_dir(tmp_path, APP, [("DeviceID", False, False, ["AppFunctionality"])])
    r = run(app, label(tmp_path, [("UserID", True, ["AppFunctionality"])]))
    assert r.returncode == 1 and "DeviceID" in r.stdout


def test_data_a_manifest_links_to_the_user_must_be_linked_on_the_label(tmp_path):
    app = app_dir(tmp_path, APP + [("CrashData", False, False, ["AppFunctionality"])], [("CrashData", True, False, ["AppFunctionality"])])
    r = run(app, label(tmp_path, LABEL_OK))
    assert r.returncode == 1 and "CrashData" in r.stdout


def test_data_used_for_tracking_is_refused(tmp_path):
    app = app_dir(tmp_path, APP + [("CrashData", False, False, ["AppFunctionality"])], [("CrashData", False, True, ["AppFunctionality"])])
    r = run(app, label(tmp_path, LABEL_OK))
    assert r.returncode == 1 and "tracking" in r.stdout


def test_the_apps_own_manifest_must_declare_every_label_type(tmp_path):
    app = app_dir(tmp_path, APP, [("CrashData", False, False, ["AppFunctionality"])])
    r = run(app, label(tmp_path, LABEL_OK))
    assert r.returncode == 1 and "CrashData" in r.stdout


def test_a_build_with_no_manifest_fails(tmp_path):
    app = tmp_path / "PLS.app"
    app.mkdir()
    r = run(app, label(tmp_path, LABEL_OK))
    assert r.returncode == 1


def test_the_committed_manifest_and_label_agree(tmp_path):
    app = tmp_path / "PLS.app"
    app.mkdir()
    (app / "PrivacyInfo.xcprivacy").write_bytes(APP_MANIFEST.read_bytes())
    r = run(app, LABEL)
    assert r.returncode == 0, r.stdout + r.stderr
