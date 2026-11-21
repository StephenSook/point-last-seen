# Spanish notes: draft word lists and cases

Status: draft, machine-reviewed, no native speaker yet. No code reads anything in this folder.

These files are the shared pieces that [Spanish notes and reports](../spanish-reports.md) asks for, in its own
order: word lists and cases first, then a check by a fluent Spanish speaker ([CHECKLIST.md](CHECKLIST.md)), and only
then the ports to each platform. `cloudLanguages` stays `["en"]`, so no Spanish note goes to the cloud read until the
Spanish phone-number and evidence checks pass on every platform.

| File | Twin of | What it holds |
|---|---|---|
| `language-words.v2.json` | `shared/constants/language-words.json` | The v1 foreign words split by language (less four that are everyday English: as, do, hay, sin), Spanish words a family or a searcher types, `noteLanguage` (`en`, `es` or `other`), and `cloudLanguages`. |
| `phone-words.es.json` | the phone-number rule | The Spanish digit words already in the rule, a proposed rule change for numbers said in pairs and hundreds ("quinientos cincuenta y cinco"), and month and street words that keep dates and addresses. |
| `evidence-terms.es.json` | `shared/constants/evidence-terms.json` | Spanish evidence terms, folded, with plurals and feminine forms. |
| `grounding-words.es.json` | `shared/constants/grounding-words.json` | Spanish colours and directions for each value, the capital O for west, and stop words. |
| `found-kind.es.json` | `shared/engine-ts/src/found.ts` | Found verbs, objects, features and person words, and the two Spanish rules that keep a person found: a clitic before the verb ("la encontramos") and the personal a ("encontramos a la señora"). |
| `vectors.es.json` | `shared/test-vectors/*` | 32 cases, each with what it should give and what the shared rules give today. |

## What the language draft was checked against

Measured on 2026-11-21 with a local port of the rule, not in the repository (v2 keeps v1's refuse rule and drops four
words from its lists, so each port measures it the same way):

- every case in `shared/test-vectors/language.json` gives the same answer, with each refused Spanish note read as `es` and each other refused note as `other`;
- the known miss "Ella no está aquí" is read as Spanish;
- of 6,365 English sentences from this repository's docs (the Spanish design pages left out), v2 refuses none that v1 allows;
- the four lists share no word and none is in the English list; four v1 foreign words that are also everyday English (as, do, hay, sin) are dropped, and every language case still gives the same answer;
- "Vamos para casa" is a known miss: every word is shared with Portuguese, so it is refused for the cloud as today but not called Spanish.

## What today's rules do with the Spanish cases

Measured on main on 2026-11-21 (each case's `today` field):

- Language: whole Spanish notes are refused for the cloud, as they should be; "Ella no está aquí" passes as English.
- Phone numbers: digit words and written digits are removed; numbers said in pairs and hundreds are kept. Dates, times, ages and addresses stay.
- Evidence: no Spanish case is flagged.
- Grounding: every Spanish colour and direction is blanked.
- Found-kind: no Spanish note is corrected.
