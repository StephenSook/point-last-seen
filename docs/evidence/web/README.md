# Web evidence

## Command removes a member, 2026-11-22

A screen recording, `2026-11-22-command-remove-member.mp4` (20.96 s, 1920 x 1080, 25 fps, no audio), shows the
deployed command post (commit 5e07057b, served at https://buildhybridai-2026-yg3m.web.app) on `drill-review-1`, the
training drill made for App Review (made-up data; nobody is missing). It was recorded with Playwright in Chrome, in
a fresh browser profile signed in as command, with real clicks; the first 5.4 s of the page loading were cut.

1. 0 s: the command post, with People listing two searchers.
2. About 4 s: "Remove from this drill" on Team 2 searcher, a test account made for this clip, asks "Remove Team 2
   searcher? They lose access at once and cannot join again."
3. About 7 s: Remove. The row reads "Removed"; Team 1 searcher stays in.
4. About 13 s: "Give searchers a new code" shows its confirm; about 16 s: Cancel. No code was replaced and none is shown.

After the clip, a fresh sign-in read the drill's People list: Team 1 searcher active, Team 2 searcher removed.
"Radio check" at the top right is the match code teams read over the radio (the same code means the same prior
version and reports), not a join code.

The clip itself is kept outside this repository, which takes no video files; it was made for the App Store
review. Its SHA-256 lets anyone holding a copy check it is this recording:
`26b4ad8149c9258375b64b2d0dbefc00b0440fcb4b557f35e17b04a2c1923ac6`

## A sighting note read with the network off, 2026-11-26

`2026-11-26-note-read-offline-devtools.jpg` (2268 x 1290) is one window capture of Chrome 158 showing the deployed
command post (commit 5d59d16d) on `drill-test-1`, signed in as command, beside DevTools. The Network panel has
Offline selected, and every request in its list is "(failed)": the `/version.json` probe fetched just before the
click on Read the note, then the Firestore, `cleardot.gif` and telemetry retries during the read. The open
"What ran" receipt says "Ran: on this device (reported by the SDK)." and "Sent: no text or image left this device."
The note is made up; the sighting was never saved.

The full record, `2026-11-26-note-read-offline-devtools.json`, has all four reads and every request in their
windows. None went to an AI host. One CORS preflight to Remote Config's realtime host got through 9.6 s after
the second read, because DevTools' Offline setting does not stop preflights. The screenshot's SHA-256:
`0da0300fede3c42d8e499e448bca43df93561a945531155f4079d94a0f1a46bd`

## A box for every second of a clip: spike, 2026-11-26

`2026-11-26-clip-track-spike.json` asks whether the cloud model can box the person for each second of a clip
(a separate read on the window triage flagged), and whether this laptop's model can box the same frames. Six
clips were used: the team's own night porch clip (training drill) and five Pexels stock clips with actors. The
truth was written from frame stills before any model call, and every box was graded by eye on the frame at its
second.

- Cloud track: no clip reached the 70% pass line. The team clip scored 0% and 33% over two runs; the stock clips
  63%, 53%, 1 of 2 seconds, 17% and 0%. The boxes barely move from second to second.
- On this laptop: 0 of 70 frames matched the cloud box at IoU 0.5 or more.
- The sighting read's single key-frame box was on the person in 4 of 6 clips, the team clip included, and its
  first and last seen were within 1 s on all 6.
- The track schema first tried (a pattern on the time, bounds on every number, a 121-item cap) was refused as
  "too many states for serving"; integer seconds with no bounds was accepted. A 4096-token output cap returned
  HTTP 500 on the team clip; 2048 worked.

`2026-11-26-clip-track-spike-doorbell.jpg` is the team clip's sheet: cyan is cloud run 1, magenta run 2, yellow
the on-device box. Its SHA-256: `1bf58f5ef78636fe6721d9ca740bfc47d207a8cde4fb11d97d952c2f69980150`

## The same clips as frames: spike 2, 2026-11-26

`2026-11-26-clip-track-frames-spike.json` sends the clip as one JPEG per second (taken on this laptop from the
same consented window), all in one request with "t=<second>" before each frame, on gemini-3.5-flash-lite.

- The box followed the person on every second it was in view: the team clip 9 of 9 (two runs, which agree at
  IoU 0.85 to 0.98), the man in black 19 of 19 (with no box on the black first frame, which is right), the night
  street 12 of 12. That passes the same 70% line the video path failed.
- An outline per frame (a 16-point polygon) landed on the person in 9 of 9 frames of the team clip, at about 6
  frames per call.
- gemini-3.8-flash answered HTTP 500 on 4 of 4 calls and was not used.

`2026-11-26-clip-track-frames-doorbell.jpg` (boxes; SHA-256
`400c33942c3d10b0ddac1f5eaa9aa16a063baa87eb64f06999b4a62bcfd77c34`) and
`2026-11-26-clip-track-frames-doorbell-masks.jpg` (outlines; SHA-256
`f1fab9e8e1d28e019e0ee365b7f17ad888db3f2e88e904d4558412302420362a`) are the team clip's sheets.
