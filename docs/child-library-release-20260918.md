# Production child library — 18 September 2026

User approved deployment of the child library: topic cards without decorative tabs, vivid text-format dots on topic cards and stories, scoped stories, real preview before native reading. Production URL remains https://yehuditamos.github.io/booki/ .

This release integrates into the maintained `index.html` and existing `screen-library`; it does not replace production with a copied demo. `child-library-topics.js` holds the interest taxonomy, `child-library.js` owns the child-only UI, `child-library.css` scopes its styles, and shared `child-choice.js` provides safe text previews. Public/private/both catalog selection remains with `BookiPrivateLibrary`. Private content is kept only in memory and cleared on exit/context changes. No new stored child levels, schema, security rules or analytics services.

Native home, class goal, teacher workspace, teacher recommendations, letter practice, real-book reading, niqqud policy, pause/resume, reading completion and points remain in their existing code paths. The native start function adds a context/current-navigation guard after its asynchronous library refresh. Preview alone never calls startStory or records reading.

All authorized catalog stories remain reachable through All Stories. Folder dots are calculated from the actual scoped items, not fixed levels; thresholds describe text quantity, not diagnosed reading ability. Existing editorial review of vocabulary/niqqud remains a separate task. No text content changed.

Verification uses the actual production DOM, native reading/save functions and private-library module against synthetic in-memory Firebase-shaped test data. It covers public/private/both, failures/retry, cancelled loads/starts, teacher isolation, preview/start/pause/resume/completion/wallet/goal and 320/390/1280px. It does not log into an actual teacher/student account or mutate production student data. Existing reading/roster regression suites also run.

Rollback: restore only index.html and script.js from baseline cd87c67346d8d1c2a6dbce9be9e7c972c7d5e876. New assets can remain unused; no data rollback is needed. The old draft PR #41 is not a prerequisite and must not be blindly merged over this release.
