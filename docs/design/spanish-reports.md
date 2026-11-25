# Spanish notes and reports: design

Status: proposal. No code yet. Section 6 says who builds what.

Today every typed note is expected in English. A family member or searcher who writes in Spanish gets the
fields filled by hand, or by the rules parser, which knows English words only. This page says what it would take for
Point Last Seen to read a note written in Spanish, on each route, without losing any of the checks an English note
gets.

Scope: the language of what people type (family notes, searchers' reports, command post sighting notes). The app's
own screens stay in English in this proposal; section 5 lists the few lines that change.

## 1. Which model reads Spanish on each route

| Route | Model | Spanish? | Source |
|---|---|---|---|
| iPhone, on the phone | Apple's on-device model (Foundation Models) | Yes | Apple: the model "understands and generates text in any language that Apple Intelligence supports" ([Supporting languages and locales with Foundation Models](https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models)); Apple Intelligence supports Spanish ([support.apple.com/121115](https://support.apple.com/en-is/121115)). |
| Android, on the phone | Gemini Nano through ML Kit's Prompt API (Firebase AI Logic hybrid mode) | Not published | The Prompt API pages give no language list; the GenAI overview says "Availability of specific language support may vary depending on the particular device's configuration and the models that have been downloaded to the device" ([ML Kit GenAI](https://developers.google.com/ml-kit/genai)). CANNOT VERIFY from the docs. Measure it on the borrowed Nano phone (the asks under this table). |
| Web, in Chrome | Chrome's built-in model (Prompt API) | Yes, when asked for | "The Prompt API accepts "en", "ja", "es", "de", and "fr"" for `expectedInputs` and `expectedOutputs` ([The Prompt API](https://developer.chrome.com/docs/ai/prompt-api)). Our gate asks for English only (`web/src/ai/gate.ts:14`). |
| Every platform, in the cloud | Gemini through Firebase AI Logic | Yes | The Firebase AI Logic models page lists Spanish (`es`) among the supported languages of its general-use Gemini models ([Learn about supported models](https://firebase.google.com/docs/ai-logic/models)). |

Two facts about today's code matter here:

- The language screen guards the cloud route only. Android already sends a note that does not look English to the
  phone's own model when the phone has one (`FamilyNote.read`: a local model plus a non-English note routes
  `ONLY_ON_DEVICE`). That path has never run with a non-English note: the only on-device run, on a Pixel 10 on
  2026-11-25, read English notes.
- The iPhone checks the phone's language setting (`supportsLocale`), not the note's language, so a Spanish note on
  an English-language iPhone can go to Apple's model today. The language screen runs only at the moment of a cloud
  read; a note it refuses is read by the English rules parser (`ReadOrchestrator.swift:191-195`).

Asks: Android adds one Spanish note to the borrowed-phone runbook's on-device step and records the result. iPhone
checks `SystemLanguageModel.default.supportedLanguages` for Spanish instead of relying on the phone's setting. Web
asks Chrome for `["en", "es"]`.

## 2. What the language screen should allow

Replace "looks English" with "which language": `noteLanguage(text)` returns `en`, `es` or `other`, from the same
word count as today. `shared/constants/language-words.json` gains a `spanish` list (the Spanish words now inside
`foreign`) and a `cloudLanguages` list that starts as `["en"]`.

| Note | Phone's own model | Cloud (only with consent, as today) |
|---|---|---|
| `en` | Yes | Yes |
| `es` | Yes, when that model supports Spanish (section 1) | Only when `cloudLanguages` holds `es` |
| `other` | As today | No, as today |

`cloudLanguages` gets `es` only in the change that ships the Spanish phone-number rule and the Spanish evidence
terms (section 3) on every platform. One shared value moves all platforms together, and no platform sends Spanish
to the cloud before its own checks pass the Spanish vectors.

Every reading of a Spanish note records `noteLanguage: "es"` with its route, so the command post can say the note
was written in Spanish and a published run can count them.

Free text stays in the writer's language: labels, summaries and evidence quotes are copied from the note, never
translated. The prompts say so in one line. A model's translation of a clue is a claim nobody on the team can check,
and grounding (section 3) compares the reading with the note's own words.

Asks: the shared code gets `noteLanguage` and the new constants; each platform ports it as it ported `looksEnglish`.

## 3. The checks that need Spanish twins

| Check | Today | Without a twin, a Spanish note | Twin needed |
|---|---|---|---|
| Phone-number removal (`PhoneNumbers.kt`, `PhoneNumbers.swift`, `web/src/data/phoneNumbers.ts`) | Digits in any script, English digit words ("four oh four"), English months, US street words | Keeps a number written as words ("cuatro cero cuatro cinco cinco cinco cero uno cuatro dos") | Digit words: cero, uno, una, dos, tres, cuatro, cinco, seis, siete, ocho, nueve. Months and their short forms: enero (ene) to diciembre (dic), with septiembre and setiembre. Street words: calle, avenida, av, camino, carretera, paseo, bulevar. |
| Evidence pre-screen (`shared/constants/evidence-terms.json`) | 42 English terms | Reaches a model with no team protocol shown | sangre, ensangrentado, cuerpo, cadaver, restos, hueso, craneo, esqueleto, arma, cuchillo, navaja, pistola, rifle, escopeta, casquillo, bala, jeringa, aguja, cinta adhesiva, bridas, esposas, tumba, fosa, pala, tierra removida, recien excavado, ropa rota, ropa rasgada, forcejeo, marcas de arrastre, with plurals and feminine forms. Accents fold away, so the terms are written without them. "esposas" also means wives and "restos" also means leftovers: the screen errs toward flagging, as it does today. |
| Grounding (`shared/constants/grounding-words.json`) | A colour or direction stays only when its English word is in the note | Every colour and direction is blanked, because "azul" is not "blue" | Colours with gender and number (negro, negra, negros, negras; blanco; gris; marron, cafe; rojo; naranja, anaranjado; amarillo; verde; azul; morado, purpura; rosa, rosado). Directions: norte, sur, este, oeste, noreste, noroeste, sureste, suroeste, rio arriba, rio abajo. Capital letters: O stands for west (oeste), so the capital-letter table needs a Spanish row. Stop words: el, la, los, las, un, una, con, del, que, su, sus, llevaba, traia, cerca. Grounding lowercases but does not fold accents (`ground.ts`), so it should fold them the way the evidence screen does, or "marrón" in a note never matches. Footwear and carried compare words with the note, so they work in Spanish as long as the reading copies the note's words. |
| Found-kind correction (`shared/engine-ts/src/found.ts`, `FoundKind.swift`) | Corrects "found a coat by the creek" from found to clue, from English word lists | Is never corrected; the command post says Found for a coat | Verbs: encontre, encontramos, encontraron, hallamos, hallaron. Determiners: un, una, unos, unas, el, la, los, las, su, sus. Objects, features and person words in Spanish. One new rule: a clitic pronoun before the verb ("la encontramos", we found her) names a person, so the note keeps the model's kind. "la" is an article after the verb and a pronoun before it. |
| Rules parser, iPhone (`ReportParser.swift`) | English words | Reads nothing; the reading is empty | The same feature, clothing and colour words as above. Lowest priority: it runs only when no model can read. |

Until the phone-number and evidence twins ship, Spanish stays off the cloud (section 2). Grounding and found-kind
twins must ship before or with any Spanish read, on any route, or Spanish readings lose their colours and directions.

Found today, for the follow-up list: an English note can already carry a phone number spelled in Spanish digit
words past the phone-number rule and the language screen ("Call cuatro cero cuatro ..."). It is recorded here, not
raised as a phone-rule question, per the current rule on phone-rule questions.

## 4. Proposed shared vectors

These are drafts. A fluent Spanish speaker must check every note and every expected value before any vector is
committed or trusted, and must say whether each note reads like something a person would type. Each file keeps its
current format; the cases go in `shared/test-vectors/`.

| File | Note | Expected |
|---|---|---|
| language.json | Se fue caminando hacia el parque esta mañana | es |
| language.json | Ella no está aquí | es (today it passes as English) |
| language.json | She kept saying "mi casa" before she left | en |
| family-notes.json (new) | Le gusta caminar hasta la iglesia de San José los domingos | place, label from the note |
| family-notes.json (new) | Vivía en la calle Maple 412 antes de mudarse | address |
| family-notes.json (new) | Una vez la encontraron en el estacionamiento del supermercado | wandering |
| family-notes.json (new) | Siempre lleva un suéter rojo y zapatos blancos | clothing |
| grounding.json | Vimos a una mujer con chaqueta azul caminando hacia el norte | colour blue, direction N kept |
| grounding.json | Iba hacia el O por el sendero | direction W kept |
| grounding.json | Llevaba algo en la mano (model says red) | colour blanked |
| found-kind.json | Encontramos una chaqueta azul junto al arroyo | corrected to clue, feature creek_or_drainage |
| found-kind.json | La encontramos junto al arroyo, está bien | kept as found |
| found-kind.json | Encontramos a la señora sentada en una banca | kept as found |
| evidence-terms | Hay sangre en la chaqueta | possible evidence |
| evidence-terms | Vimos una pala y tierra removida | possible evidence |
| phone-numbers.json | Llame al cuatro cero cuatro cinco cinco cinco cero uno cuatro dos | number removed |
| phone-numbers.json | Llamen al 404-555-0142 | number removed |
| phone-numbers.json | Visto el 19/11/2026 a las 14:30 | kept (date and time) |

## 5. Lines that change on screen

| Where | Today | Proposed |
|---|---|---|
| Android `Copy.NOT_ENGLISH`, web `SightingForm.tsx:288` | This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand. | This note isn't in English or Spanish, so it isn't sent to the cloud to be read. Fill the fields by hand. (While `cloudLanguages` is `["en"]`, a Spanish note on a phone without a model shows: This note is in Spanish, which isn't sent to the cloud yet. Fill the fields by hand.) |
| iPhone `EchoText.swift:51` | This note doesn't look like English, so it isn't sent to the cloud to be read. Pick instead of typing. | The same change, ending "Pick instead of typing." |
| Command post reading and receipt (web) | No language shown | "Written in Spanish" beside a reading whose `noteLanguage` is `es` |
| About this phone (Android, iPhone) | Model state only | Unchanged. A Spanish line is added only after the borrowed-phone run shows the phone's model reads Spanish. |

The rest of the app stays in English. A Spanish interface is a separate project: Android `Copy.kt`, the iPhone's
text in `PLSCore` and its views, and the web components.

## 6. Effort per platform

| Where | Work | Estimate |
|---|---|---|
| Shared code | `noteLanguage` and `language-words.json` v2; Spanish twins in grounding, evidence and found-kind constants; the clitic rule; the vectors after the fluent check; the `noteLanguage` field in the reading and route schemas; prompt lines; LIMITS. | 2 days |
| iPhone | Port `noteLanguage`; Spanish phone-number words; `supportedLanguages` check; found-kind clitic rule; parser words (last). | 2 days |
| Web | Port the screen; `["en", "es"]` in the Chrome gate; Spanish phone-number words in the web port; the "Written in Spanish" label; copy. | 1 day |
| Android | Port `noteLanguage`; route `es` per section 2; Spanish phone-number words; copy; the Spanish read on the borrowed Nano phone. | 1 day |
| Fluent speaker | Check every vector and word list in sections 3 and 4. Blocking: nothing ships to the cloud before this. | About 2 hours |

Order: word lists and vectors drafted, then the fluent check, then the phone-number and evidence twins on every
platform, then the language screen, grounding and found-kind, and last `cloudLanguages` gains `es`.
