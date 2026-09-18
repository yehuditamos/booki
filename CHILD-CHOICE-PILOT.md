# Booki child choice pilot — 18 September 2026

Entry points:
- `child-choice-test.html`: no login, no Firebase, no analytics; standalone public-catalog demo. Reading here is never saved. Start, preview, next/back, pause/resume in the same tab, niqqud toggle, and optional next-text preference.
- `child-choice-app-test.html`: isolated copy of the application entry point plus opt-in adapter. Uses existing authentication, catalog permissions, reading/session persistence, recommendations and class goal. Reading here DOES use the real app. Not linked from production navigation.
- The normal `index.html` and all existing assets remain unchanged.

Shared component uses only the supplied catalog. No public fallback, localStorage, child level assignment, or private text persistence. Preview rechecks reader context and catalog availability before opening; actual startStory also refreshes server scope.

Catalog mapping: 53 stories from the current index. `child-choice-catalog.json` records exact length/word features, densest page and initial text-format grouping. Boundaries (12 / 45 words on the densest page, sentence limits) are product heuristics, NOT validated reading levels. A word per page must hold on every nonblank page. Others use honest labels: short sentences, several sentences, paragraphs. Densest-page preview supplements opening page.

Research/design basis: IES foundational reading guide 21, comprehension guide 14; W3C Use of Color. Interest and choice alongside decoding support. Color + symbol + text; all catalog stories available regardless of preferences.

Before general rollout:
- Editorial review of vocabulary, syntax and niqqud; word counts alone do not assess pedagogical suitability. The JSON deliberately marks that review as pending.
- Test the authenticated route with teacher-selected public/private/both catalogs and an actual recommendation. Pure component tests cover scoped input and context changes, but do not replace signed-in verification.
- Observe a few children choosing independently. Verify understanding of labels, ability to change stories and overall interest.
- Decide final illustration direction; pilot currently uses existing story symbols in illustrated cover compositions.
- Replace copied entry with a maintained feature switch when rollout is approved; don't let a second index diverge.

No schema, rules, stored story or student data changes in this release. Niqqud reward policy remains unchanged in the full-app route; standalone demo awards no points.

Run: node child-choice.test.cjs
Regenerate catalog / pilot HTML: node build-pilot.cjs (from repository root).
