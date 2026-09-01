# Booki — School Pilot Security Hardening

## Hard boundary

The live Omri/Mitarim class is **out of scope** for this branch.

- Do not deploy this branch's Firestore rules to production.
- Do not migrate `classes/mitarim-aleph-2025`.
- Do not change existing production club/class documents.
- Do not change the current live login/session behavior.
- Do not merge to `main` until a separate test environment has passed the access matrix below and explicit approval is given.

## Target model for NEW school-pilot classes

Every authenticated user gets a Firebase UID. Access to a club is granted through a UID-keyed lookup:

`clubMembers/{clubId}/members/{uid}`

Member document minimum fields:

```js
{
  uid: string,
  clubId: string,
  role: 'student' | 'teacher',
  active: true,
  createdAt: timestamp
}
```

No child surname, email, phone, birth date, audio or transcript is required in this access document.

## Required rule helpers

- `isClubMember(clubId)` — true only when an active membership exists for request.auth.uid.
- `isClubTeacher(clubId)` — teacher/owner of that club.
- `canReadClub(clubId)` — member OR teacher OR Booki owner.

## Collections that must stop using open reads for NEW pilot clubs

- club root
- memberships
- rewards
- economy
- goalCycles
- shop
- votes
- purchases
- classroom announcements/messages

Individual/private records must additionally require ownership of that specific record.

## Teacher-created child cards

A child card can be claimed once. After claim, updates that belong to the child must require:

`resource.data.claimedByUid == request.auth.uid`

No unrelated signed-in user may update another child's cachedStats, emoji or avatar.

## Test access matrix — must all pass before any production discussion

| Actor | Own pilot data | Another child same class | Another class | Teacher-only data | Write another child |
|---|---|---|---|---|---|
| Pilot child A | allow | deny | deny | deny | deny |
| Pilot child B | allow | deny | deny | deny | deny |
| Pilot teacher | allow class scope | allow class scope | deny | allow own class | allow own class only |
| Unrelated signed-in user | deny | deny | deny | deny | deny |
| Anonymous non-member | deny | deny | deny | deny | deny |
| Booki owner/admin | allow | allow | allow | allow | allow |

## Production gate

Only after all tests pass:

1. Review diff manually.
2. Confirm no dependency on the live Omri/Mitarim legacy path.
3. Test a brand-new dummy class from creation through child join and reading.
4. Obtain explicit approval before any production rules deployment.

Until then the live class remains untouched.
