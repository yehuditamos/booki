# Private teacher libraries

Teacher dashboard → הספרייה הפרטית שלי. Libraries belong to the teacher account and can be used by every club owned by that teacher. Each club independently selects public Booki or private teacher content. No owner moderation or approval queue.

## Included

- Local Hebrew/English photo OCR, image upload, UTF-8 TXT import and paste; source images are not uploaded to Firestore. PDF and Word files are not supported by this version.
- Plain text title/body editor, niqqud palette/removal, live preview, draft and publish actions. Niqqud is manually edited; this does not claim automatic linguistic vocalization.
- Server-enforced teacher ownership, published-only reads for currently associated students, no reads for unrelated teachers/users or unauthenticated visitors. Revocation is checked against current club mode and membership on each server request.
- No owner review. A teacher can return a published story to draft to remove it from students' next library load.
- Existing story player, reading accounting and teacher recommendations use the selected catalog. Private stories do not enter the public catalog. An unavailable private library never falls back to public stories.

## Deployment gate — not yet live

Firebase project: `mitarim-reading`. The current execution environment has no authenticated Firebase management account (`firebase projects:list` fails authentication). Do not claim this feature is deployed, and do not merge frontend changes before installing the rules.

1. With an authorized Firebase management login, inspect the production rules for changes newer than this branch, then merge those changes into `firestore.rules` if necessary.
2. Deploy rules only from this checkout: `firebase deploy --only firestore:rules --project mitarim-reading`. This adds library-scoped permissions without migrating/deleting existing data.
3. Merge this branch to deploy the website. There is no config document to create: the authenticated read of the absent `libraryConfig/availability` document is the rules-availability probe.
4. Verify using two real teachers and their student cards: publish one story, choose private for a club, open as its student, confirm only the private story appears, read and save minutes; confirm an unrelated teacher/student cannot fetch the document. Then switch the club back to public.

## Validation

Run `npm install` then `npm test` in `tests/private-library` with Node 24 and Java 17+. The tests use only the `demo-booki-private` emulator project.

Passed locally: catalog selection, account/card switch isolation, fail-closed behavior, niqqud preservation, page splitting, teacher editing/preview, draft/publish and mode selection. Firestore emulator tests passed for legitimate grants, unrelated/guest denial, no draft reads, filtered list queries, and revocation on departure/reclaim/public mode.

Not yet verified: real Firebase deployment/account flow, real phone OCR, visual device testing. Privacy cannot retract text already displayed or prevent a student from copying it; it controls subsequent database access.
