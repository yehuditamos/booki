# Operations and release requirements

These are proposed production settings, not enabled services. Firebase remains on
Spark; no billing change has been made.

## Backup and recovery configuration to activate after billing approval

- Daily managed Firestore backup; keep 14 daily recovery points.
- Weekly managed backup; keep 12 weekly recovery points.
- Enable point-in-time recovery where supported, independent of scheduled backups.
- Grant backup restore permissions only to the application owner and a separately
  approved recovery operator. Backup access must not be available to child clients.
- Proposed recovery objectives: at most 24 hours of lost writes from scheduled
  backup, restore service within 4 hours. Verify achievable objectives in a drill;
  do not promise them before measuring.
- Restore into a separate project/database, validate collection counts, sample
  reading totals and session IDs, then verify negative authorization tests before
  reconnecting any production client. Never run a restore over live child records
  as a first test.
- A rule snapshot is configuration recovery only. It is not a backup of reading data.

## Server accounting boundary

The next backend must authenticate Firebase ID tokens; resolve class membership
from the UID and current card binding; reject revoked/left memberships; validate
session duration/type; compute awards from the verified product rules; and commit
the immutable session, card counters and accounting record atomically. Clients
must not choose their own award totals or mutate the wallet directly. Use the
completion ID for idempotency, including retries across devices/process restarts.
Migration must preserve every existing session and aggregate; do not recalculate
historic awards from an assumed formula.

## Load acceptance plan

Use synthetic accounts/data in a dedicated staging project. Run these separately:

| Scenario | Target / required observation |
| --- | --- |
| Reading/roster/library retrieval | 1,000, then 5,000 active readers; measure p50/p95/p99 latency and error rate |
| Normal saves | Spread across 20 then 100 classes; compare submitted unique IDs with persisted unique sessions and counters |
| Hot class | 50 children saving within the same second; measure transaction retries and wallet contention |
| Retry and disconnect | Repeat the same completion; cut network before/after acknowledgment; verify exactly one accounting effect |
| Revocation and class isolation | Replace a device; verify its old identity cannot write; unrelated class identity cannot read or write |
| Recovery | Restore a known staging dataset; validate totals, authorization and measured recovery duration |

Proposed targets: zero lost or duplicated acknowledged completions; unauthorized
requests always denied; save p95 below 2 seconds under the agreed load; no unbounded
retry/backlog growth. These targets have not yet been measured in production.

## Deployment controls

Require Booki Runtime QA and Booki Security before merging main. Switch hosting to
an explicit deployment workflow whose deploy job depends on both checks, then
verify a deliberately failing staging change cannot deploy. The current branch
Pages automation is not yet a protected deployment gate. Rules and client releases
must be versioned together and validated against the actual active rules.

## Spend control

Before activating Blaze, agree a monthly operating budget and alert recipients.
Configure budget alerts at 50%, 80% and 100%; Google billing alerts do not hard-cap
spending. Also cap server instances/concurrency, enforce request quotas, isolate
staging and production, and provide an application kill switch for nonessential
experiments. A dedicated Supabase project additionally requires an organization
selection and the provider's project cost confirmation.

## Dependency audit

The original test tooling audit reported 19 findings (1 critical, 10 high, 8
moderate). Updating firebase-tools to 15.32.1 and pinning patched grpc-js 1.14.5 and
basic-ftp 6.2.1 removes all critical/high findings in the tested dependency tree.
Five moderate findings remain in CLI dependencies (firebase-tools, pubsub,
opentelemetry/core, gaxios and uuid). This is development/CI tooling; it is not
evidence of a browser exploit or of child-data theft. Track the remaining findings
and upgrade compatible vendor releases. The browser SDK uses a separate CDN
dependency and needs its own compatibility review.
