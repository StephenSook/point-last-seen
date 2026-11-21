# One session on a borrowed Gemini Nano phone (family app)

Use this page to prove the family app's on-device read on a phone that has Gemini Nano, in one visit. The phone
belongs to someone else, so give it back as it came. The phone must be on ML Kit's Gemini Nano list for the Prompt
API (for example a Pixel 10 or 11). Our own test phone has no AICore, the Android service that runs on-device
models, so this read has never run on it.

## 1. The owner does these steps (their phone, their keystrokes)

1. Turn on Developer options: Settings > About phone > tap **Build number** seven times (on some phones it is under
   Software information), then enter the phone's PIN.
2. Turn on **USB debugging** in Settings > Developer options. Plug the phone into the Mac and tap **Allow** on
   "Allow USB debugging?". Leave "Always allow from this computer" off.
3. Connect the phone to Wi-Fi. The app starts the model download by itself only on Wi-Fi.
4. Keep the phone unlocked. Android runs the on-device model only for the app on screen.

What the model download needs, from the ML Kit and Firebase docs:
- The model comes through AICore, and AICore keeps one copy for every app on the phone. If another app already got
  it, the app shows "Ready on this phone." at once.
- A phone that was just set up or reset may need a few minutes to a few hours before AICore can download. A restart
  can make it faster. A phone with an unlocked bootloader cannot run it.
- The docs give no download size. The app shows the percent.

## 2. Our checks (about 20 minutes)

1. Build the release APK from main, then install it. Use the release build only. It uses Play Integrity, and a
   debug build carries a debug secret.

   ```
   bash android/release.sh
   adb devices -l    # one phone; use its serial below
   adb -s <serial> install android/app/build/outputs/apk/release/app-release.apk
   ```

2. Record the facts into `docs/evidence/android-nano/<phone>-<date>/facts.txt`:

   ```
   git rev-parse HEAD
   adb -s <serial> shell getprop ro.product.model
   adb -s <serial> shell getprop ro.build.version.release
   adb -s <serial> shell dumpsys package com.google.android.aicore | grep versionName
   adb -s <serial> shell dumpsys package app.pointlastseen.family | grep versionCode
   ```

3. Open **PLS Family**. Do not join a search: this phone is not ours, and no search data belongs on it. Open
   "I remembered something". The line under the title is the model's state:
   - "Ready on this phone." Go to step 4.
   - "The on-device model is downloading: N%." Wait for "Ready on this phone." The app checks the model again
     each time it comes back to the front.
   - "An on-device model can be downloaded to this phone." with **Get the on-device model**. Tap it.
   - Nothing under the title: the phone reports no model. Stop and write that down.
4. On-device read, three times. Type "She likes to walk to the old mill by the creek" and tap **Sort it**. Do not
   agree to the cloud. The result must say "Read on this phone in N s." Write down each time.
5. Airplane mode. The owner turns on airplane mode (adb still works over the cable). Repeat step 4 once. It must
   again say "Read on this phone in N s." The owner then turns airplane mode off.
6. Screenshots of our app only, saved straight to the Mac. Before you commit one, check that no notification of the
   owner shows in it.

   ```
   adb -s <serial> exec-out screencap -p > docs/evidence/android-nano/<phone>-<date>/read-1.png
   ```

## 3. Film beats (Stephen films the phone's screen)

1. The note screen with "Ready on this phone." under the title.
2. Type the note, tap **Sort it**, and hold on "Read on this phone in N s."
3. The airplane icon in the status bar, then the same read with the same line.

## 4. Give the phone back as it came

1. `adb -s <serial> uninstall app.pointlastseen.family` (and any other package we installed).
2. The owner turns airplane mode off, taps **Revoke USB debugging authorizations**, turns USB debugging off, and
   turns Developer options off.
3. We add no account, change no other setting, and leave no file on the phone. The screenshots go straight to the
   Mac, so nothing stays on the phone.
4. One thing stays: if our session downloaded Gemini Nano, AICore keeps it for every app on the phone. Only the owner
   can remove it, by clearing AICore's data. Tell the owner.
