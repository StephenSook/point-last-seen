# iPhone route check on a real phone, 2026-11-20 (build 8)

Build 8 of the iPhone app (version 0.1.0, commit 8dfa5358, an Ad Hoc release build signed for this
phone, installed over USB) on an iPhone 17 Pro (iPhone18,1), iOS 27.2.1 (24B156), against the
deployed Firebase project. App Check used App Attest in its production environment (no debug
provider). The app was in the practice drill (sample data; nobody is missing). Build 8 is the first
build with the iOS 26.0 minimum, the grounding rule and the phone rule's last three cases; build 7's
check is in `../iphone-2026-11-20-build7/`.

`route-check-1795220891127.json` is the file the app's route check wrote (Ready check, then "Check
both read routes") at 2026-11-21T00:28:11Z (7:28 PM Eastern on November 20), copied off the phone with
`devicectl device copy from`. The check reads one fixed drill sentence, "Cleared segment BO, nothing
found.", with the app's own reader on each route:

| Route | Path and stage | Model as recorded | Time | Reading | Stage notes |
|---|---|---|---|---|---|
| On this iPhone, no signal | on_device, guided | AFM 3 Core Advanced | 1,793 ms | cleared, segment BO | none |
| In the cloud | cloud, guided | gemini-3.5-flash-lite | 1,343 ms | cleared, segment BO | none |

The on-device route runs with the network marked off and cloud consent off (reason `no_network`), so
only Apple's on-device model can read it. The cloud route turns Apple's model off for that one read
(reason `on_device_unavailable`) and sends the sentence to the cloud through Firebase AI Logic.
`blocked` is null on both: no guardrail or refusal. Stage notes are empty on both: the first stage
answered, and its reading passed the validator.

What this does not show: it is one fixed sentence on one phone, on iOS 27. It is not a measure of how
well either model reads reports, and it does not show iOS 26, where the cloud route is off.
