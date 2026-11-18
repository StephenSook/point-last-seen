# Live API for a hands-free "I remembered something" on Android: verdict, 2026-11-18

Question: can the family say what they remembered, hands-free, through the Gemini Live API with
function calling, in Firebase AI Logic on Android? No feature was built. One throwaway probe ran
and was deleted.

## Verdict

Technically yes on Android. It does not fit our rules, so the recommendation is: do not build it.
Make dictation into the existing note field one tap instead (below).

## 1. App Check on the Live connection: it works on Android (measured)

On the web the Live WebSocket sends no App Check token (firebase-js-sdk #10018), so under
enforcement Live is blocked there. Android is different.

- Code (firebase-ai 18.2.0 bytecode): `LiveGenerativeModel` builds an `AppCheckHeaderProvider`,
  which writes `X-Firebase-AppCheck` (and `Authorization: Firebase ...` when signed in).
  `APIController.getWebSocketSession` takes that header map and calls `header(key, value)` on
  the WebSocket upgrade request.
- Run (pls_phone emulator, App Check debug provider, enforcement on, project
  buildhybridai-2026-yg3m, model `gemini-3.1-flash-live-preview`, audio responses, one text
  turn "Say OK."):

| Session | Result |
|---|---|
| Default Firebase app (App Check installed) | Connected; 10 server messages, 9 with content, turn complete; 2,654 ms |
| Second Firebase app, same config, no App Check provider (control) | Refused at the handshake: `ServiceConnectionHandshakeFailedException: Channel was closed by the server. Details: Firebase App Check token is invalid.` (642 ms) |

The control shows enforcement covers Live and that our token is what lets the session in.
Function calling in a Live audio session exists in the SDK
(`LiveSession.startAudioConversation(functionCallHandler)`); it was not run.

## 2. Why it does not fit

- **Rule R8** (spec): "Possible crime evidence goes to no model. Private media goes to the cloud
  only after a consent tap, and nowhere when the local check fails." A typed note passes the
  evidence pre-screen and phone-number removal on the phone before anything is sent. A Live
  session streams the microphone to the cloud while the person speaks, so no local check can
  run first: the words exist as text only after the model has heard them. R8 cannot hold.
- **Consent tap.** Today the family consents to one finished note after the local check
  passed. With Live the tap would come before anything was said: consent to content nobody has
  seen. That is weaker, not equal.
- **No local speech-to-text either.** Turning speech into text on the phone first would need
  Android's speech recognizer or ML Kit speech recognition. Both are a model call outside
  Firebase AI Logic, which the spec's anti-goals and the event FAQ rule out, and the spec lists
  "any speech API called by the app" as a non-goal.
- **Shape of the reply.** Live has no structured output; the note would have to arrive through
  a function call and still pass our parser. Possible, but more surface for one sentence.
- **Other costs.** Cloud only (no on-device path, so no hybrid story), Preview model, a new
  RECORD_AUDIO permission, AI monitoring does not cover Live, sessions end after about 10 to 15
  minutes.

## 3. Recommendation

Keep the note typed, and make speaking it one tap: open "I remembered something" with the text
field focused, so the system keyboard and its microphone key are on screen. The family dictates
with the keyboard's own voice typing; the app calls no speech API; the text then goes through
the pre-screen, phone-number removal and the consent tap exactly as today. This is the same
choice the iPhone app made for its report field.

If Stephen still wants a true Live voice note, it needs R8 changed first (audio reaching a model
before any local check), with a plain warning before the session starts. That is his decision,
not a build decision.

## How the probe ran (deleted after the run, not in the repo)

An instrumented test opened `Firebase.ai(app, GenerativeBackend.googleAI()).liveModel(...)`,
called `connect()`, sent one text, read `receive()` for up to 20 s until `turnComplete`, and
closed. It logged only counts and exception class names under its own tag. The control used
`FirebaseApp.initializeApp(context, Firebase.app.options, "probe-no-app-check")`, which has no
App Check provider.
