# Owner WhatsApp queue — 2026-09-11

Release scope:
- Owner dashboard only.
- Checkbox per teacher with a valid saved phone number.
- Select-all for WhatsApp-ready teachers.
- Missing/invalid phone numbers are visibly unavailable.
- One shared message editor; optional `{שם}` personalization token.
- Explicit-click queue: one WhatsApp draft opens per owner click.
- Booki never sends a WhatsApp message automatically.
- Queue progress survives a temporary WhatsApp handoff through sessionStorage.
- Israeli local phone numbers are normalized to +972 format for wa.me links.

Safety/compatibility:
- Implemented as an isolated pilot module loaded after existing pilot modules.
- Pilot loader continues after an optional module load error instead of stalling the release-ready chain.
- Initial setup and pilot loader query versions were bumped to force a fresh runtime after deployment.
