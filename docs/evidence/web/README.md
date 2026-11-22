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
