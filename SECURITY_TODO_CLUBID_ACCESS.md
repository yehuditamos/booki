# Security follow-up: clubId-as-boundary access model

**Status:** open, not fixed. Documented per explicit request during Sprint 11 — no code
changed as part of this note.

## The issue

Across the entire Firestore schema — `clubs/{clubId}/rewards`, `/votes`, `/economy`,
`/goalCycles`, `/shop/state`, `/purchases`, and (as of Sprint 11) the `toUserId==null`
branch of `/messages` — reads are gated by `allow read: if true` (or an equivalent
always-true condition), with **no check that the requester is actually a member of that
specific club**. Anyone who is signed in (in some cases, anyone at all) and who knows or
guesses a `clubId` can read that club's rewards catalog, vote tallies/options, wallet
balance, goal cycles, purchase history, and classroom-wide announcements.

Confirmed live against production (2026-07-26): a freshly created anonymous account with
no membership in a real, live club could successfully read that club's `rewards`
subcollection (HTTP 200) purely by knowing its `clubId`.

## Why it wasn't fixed now

- It's an **app-wide architectural pattern**, not a Sprint 11 regression — the same
  `allow read: if true` shape has been in place since at least Sprint 9, across every one
  of these collections, and was not something this sprint introduced or was asked to fix.
- A real fix requires knowing "is this signed-in user a member of this club" inside
  security rules. For self-joined students that's a cheap `exists()` check
  (`memberships/$(request.auth.uid)`). For **teacher-created cards** (`claimedByUid`
  model), the membership document's ID is a stable `cardId`, not the student's live
  `auth.uid` — rules cannot query "does any membership doc in this club have
  `claimedByUid == request.auth.uid`" without knowing that doc's ID in advance, since
  Firestore rules can only `get()`/`exists()` a *known* path, not run an arbitrary query.
  Closing this properly likely needs a schema change (e.g., a custom auth claim set on
  claim, or a reverse-lookup index keyed by uid) — real design work, not a one-line rule
  tweak.
- The actual reported bugs this sprint (vote saving, messages, shop visibility) were about
  **within-class privacy** (one student seeing another's messages/replies), which Sprint
  11 verified and fixed. This is a **cross-club** boundary question — a different, larger
  problem than what was reported.

## Risk assessment

- **Confidentiality impact:** low-to-moderate. Exposed data is classroom
  gamification/economy state (reward catalogs, vote counts, wallet balances, goal
  progress, purchase history, classroom announcements) — not student PII, reading
  history, or authentication credentials. Personal messages and vote ballots remain
  correctly scoped to the individual (verified this sprint).
- **Exploitability:** requires knowing or guessing a specific `clubId`. `clubId`s are not
  enumerable through any public listing in the app today, but they are not
  cryptographically unguessable either (some are human-chosen slugs); this is "security
  by obscurity of the identifier," not real access control.
- **Blast radius:** scoped per-club; does not expose data across the whole database at
  once, and does not allow any writes (all affected collections restrict `write` to the
  teacher/owner already).

## Suggested scope for a future fix

1. Add a real `isClubMember(clubId)` rules helper, starting with the easy case
   (self-joined: `exists(.../memberships/$(request.auth.uid))`).
2. Design a way to resolve teacher-created-card membership without an arbitrary query —
   most likely a custom claim (`request.auth.token.clubId` set via a Cloud Function on
   claim) or a denormalized `clubMembers/{clubId}/{uid}` lookup collection maintained
   alongside `memberships`.
3. Once both identity paths are covered, tighten `allow read` on `rewards`, `votes`,
   `economy`, `goalCycles`, `shop/state`, `purchases`, and the `messages` `toUserId==null`
   branch to require `isClubMember(clubId) || isClubTeacher(clubId) || isOwner()`.
4. Treat this as its own reviewed change (rules + a migration/backfill plan for existing
   teacher-created cards), not a drive-by edit — it touches every collection in the app.

---

# Security follow-up: cachedStats/avatar update on a teacher-created card doesn't check WHO is writing

**Status:** open, pre-existing (predates Sprint 11), not fixed. Found while testing the
Sprint 11 re-claim branch — not introduced by this sprint's changes.

## The issue

`firestore.rules`, `clubs/{clubId}/memberships/{userId}` `allow update`, the branch:

```
|| (isSignedIn()
    && resource.data.get('createdByTeacher', false) == true
    && resource.data.get('claimedByUid', null) != null
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['cachedStats', 'updatedAt', 'emoji', 'avatar']))
```

grants **any signed-in session** (not just the card's own `claimedByUid`) permission to
write `cachedStats`/`emoji`/`avatar` on **any already-claimed teacher-created card in any
club**, with no check that `request.auth.uid == claimedByUid`. Confirmed live: a
freshly-created, unrelated anonymous session successfully wrote to another card's fields
this way.

## Why it wasn't fixed now

Out of scope for this sprint's ask (shop/voting/messaging fixes); found incidentally while
verifying the new re-claim branch. Fixing it requires deciding the right scope (should
`cachedStats` writes be increase-only, mirroring the self-joined branch a few lines below
it, or does teacher-created intentionally allow correction/reset by anyone with access to
the roster?) — a product decision, not just a rules tweak.

## Risk assessment

Low: this only lets a signed-in session move a *stat number*, emoji, or avatar around on
someone else's card — it does not expose personal messages, ballots, or any other
private data (those are gated by the *separate*, correctly-scoped `claimedByUid`-matching
branches this sprint added/relied on). Worst case is a mischievous classmate resetting or
inflating another student's displayed stats/avatar, not a privacy or data-integrity issue
beyond that specific card's own display fields.

## Suggested scope for a future fix

Add `resource.data.get('claimedByUid', null) == request.auth.uid` to this branch's
conditions (matching the sibling branch just above it), unless there's a deliberate reason
(e.g. a "teacher resets a stuck stat from any device" use case) to keep it open — confirm
intent before tightening.
