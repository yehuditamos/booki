# Booki security work — 2026-10-01

Status: first patch deployed. PR #42 merged at fb75da5c08e46d7442b38e2af36b934da94c8e28; Runtime QA and Security both passed on d10cc67531c20021e51a0e4ed007c74e8e13dc3f. New client module observed on the live Pages site. Matching rules published in Firebase console on 2026-10-01 at 20:06 UTC (console displays 23:06 local). The Supabase experiment endpoint is paused with deployed version 2. Its existing records were not modified.
This is not an end-to-end security certification or a production load certification.

## Verified boundaries

| Component | Backend | Verified risk / dependency |
| --- | --- | --- |
| Main Booki app: firebase.js, firebase-clubs.js, routing.js, script.js, pilot-reading-save-2026-09-10.js | Firebase project mitarim-reading; Firestore and Auth | Browser anonymous identity, teacher-created cards, class data and wallet updates |
| booki-reading-pilot.html | Supabase mwfvziqmbkrjrnbbzqsf, function booki-reading-test | Separate speech-recognition experiment; shared project with other apps |
| Supabase Booki experiment storage | public.booki_reading_test_sessions | RLS enabled, no client policies; anonymous/authenticated SELECT tests returned zero. Edge Function service role writes can bypass RLS |
| Supabase historical 29/9 alert | Shared project | Exact historical sensitive-column finding is unavailable in current Advisors. Do not infer that the Booki sessions table was the reported table |

The Firebase live rules were captured from the console before changes in
firestore-live-before-2026-10-01.rules. They differed from repository rules, including
PIN branches and private-library modes. Do not use a blind repository rollback as a
substitute for the captured live version.

## First patch

- Block anonymous reassignment of existing teacher-created cards and unauthorized
  updates to their stats/avatar. Session creation requires the actual card owner.
- First personalization also requires the teacher to authorize the device.
- Add deviceAccessRequests and a teacher review screen. Teacher approval atomically
  binds the new UID and marks the request approved. The old UID loses card write
  access. Sessions/stats and card ID are retained. Children have no PIN.
- Teacher must compare the six-character request reference on the child's device
  before approving; the reference is a human confirmation aid, not a credential.
- Restrict card deletion to the class teacher or owner; require verified email for
  legacy teacher-email authorization.
- Close client owner bootstrap, block own role escalation, restrict users/profiles
  reads to self or owner. Anonymous children can still create their own basic user.
- Use immutable session documents for durable retry deduplication, including after
  eviction from the 50-completion cache; normalize numeric inputs before arithmetic.
- Add PR runtime QA and Firestore security CI. Existing automatic Pages deployments
  are not yet protected by a deployment gate; a passing workflow alone is not a gate.

## Validation

Synthetic emulator tests cover allowed saves, cross-device takeover, fake session
creation, stale-device revocation, unrelated teacher writes, unverified teacher
email, owner escalation, first activation and teacher-approved recovery. The
library privacy suite also passes. DOM tests exercise device approval, safe name
rendering and failed request handling. Reading regression tests include retry after
55 further completions, numeric-string input, failed commit and wrong owner.
No production child data was created, modified or removed by these tests.

## Release order and recovery

1. Run security and runtime checks on the exact release SHA.
2. Publish the client and verify its new device-approval module and cache versions.
3. Publish the matching Firestore rules and verify the active version in Firebase.
4. Smoke-test an authorized teacher and an existing owned card without creating
   test entries in real children’s reading history. Confirm the same stats remain.
5. Roll back client only if needed; retain takeover protection. Restoring the old
   rules reopens known vulnerabilities and requires a separate risk decision.

## Open blockers before expansion

- Public class/membership reads, including collection-group memberships, remain.
  Introduce UID-to-card access mapping validated against current membership, a
  minimal class landing/roster view, and migrate callers before closing these rules.
  See SECURITY_TODO_CLUBID_ACCESS.md. Never claim class isolation is fixed by this patch.
- Legacy classes/students allow public writes. Identify active callers and migrate
  or retire them while preserving all existing reading history.
- Wallet/stat mutations still trust client arithmetic. Move reward accounting to a
  validated, idempotent server operation; verify bounds and per-class authorization.
- Supabase experiment is disabled pending isolation. Version 2 returns 503 and
  makes no database calls or credential reads. Reopening requires an isolated backend,
  request limits, expiry, abuse control and awaited save confirmation. No arbitrary RLS policy should be added to shared
  Mia Social tables without mapping its consumers.
- Firebase is on Spark ($0/month), observed in console. Server infrastructure and
  scheduled managed backups require billing decisions. Do not silently switch plans.
- Set explicit retention for children’s data/speech text, backup access, restore
  drills, alert recipients, spend limits and production/staging separation.
- Test 1,000 then 5,000 concurrent readers in an isolated environment, including
  per-class wallet contention, disconnect/retry and pending-write recovery. Emulator
  correctness tests do not establish production throughput or paid capacity.
- Protect main and require security/runtime checks; ensure hosting deploys only
  the tested SHA. Scan dependencies and repository history without printing secrets.

Release acceptance: cross-class reads/writes denied, all saves acknowledged and
deduplicated, backup restore verified, no shared service-role blast radius, load
targets measured, and monitoring/rollback exercised. Until then, do not expand the pilot.
