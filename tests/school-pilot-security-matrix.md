# School Pilot Security Acceptance Matrix

This matrix applies only to `schoolPilotClubs/*` and `clubMembers/*` in the isolated pilot ruleset.
The live legacy Omri/Mitarim data is excluded.

## Must allow

- Child A reads own membership card.
- Child A reads shared rewards for own pilot club.
- Child A writes own ballot in own pilot club.
- Pilot teacher reads/manages own pilot club.
- Booki owner manages pilot clubs.

## Must deny

- Anonymous non-member reads any pilot club.
- Signed-in non-member reads any pilot club.
- Child A reads Child B private membership card.
- Child A updates Child B cachedStats/avatar/emoji.
- Child A reads a different pilot club.
- Child A reads teacher-only purchases.
- Child A reads another child's private message.
- Child A writes another child's ballot.
- Teacher A reads/manages Teacher B's pilot club unless Booki owner.

## Release gate

All deny cases must fail with Firestore permission-denied and all allow cases must succeed before this ruleset is considered ready.
No merge/deployment to production is authorized by this test alone.
