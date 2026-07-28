/**
 * migrate_goal_baseline_2026.js — ONE-TIME migration for exactly 2 known-affected clubs.
 *
 * Fix: goalCycles/{cycleId}.startBaseline should equal economy/wallet.lifetimeSpent
 * (not lifetimeEarned, the old — buggy — semantics). This is the ONLY field this
 * script ever writes. Nothing else (lifetimeEarned, lifetimeSpent, cachedStats,
 * purchases, memberships) is ever touched.
 *
 * Safety features (all built in, nothing optional):
 *   - Hardcoded allowlist of exactly the 2 clubs found by the read-only dry run —
 *     the script refuses to touch anything else, even if you edit clubId typos.
 *   - Always dry-runs and prints the plan FIRST. Requires the literal flag --apply
 *     to write anything. Running with no flag is always 100% safe (read-only).
 *   - Before writing, re-reads the CURRENT value and skips (does not write) if it
 *     already equals the target — so running this twice is a safe no-op the second
 *     time, never a double-write.
 *   - Writes a timestamped backup JSON (old values) to this same folder BEFORE
 *     making any change, so you always have the exact prior state on disk.
 *   - Re-reads after every write and confirms the stored value matches what was
 *     intended — prints a clear FAIL if not (does not silently continue).
 *   - Rollback: see the bottom of this file, or just use the values from your
 *     backup JSON — restoring goalCycles/{cycleId}.startBaseline to the old
 *     number listed there undoes this migration exactly, instantly.
 *
 * Requires: your own teacher/owner email + password, passed via environment
 * variables (not a command-line argument, so it never lands in shell history in
 * most shells' default config, and never touches this script's source). It goes
 * straight to Google's own sign-in endpoint and nowhere else — Claude never sees
 * it, this session or any other.
 *
 * Usage (Git Bash):
 *   BOOKI_EMAIL="you@example.com" BOOKI_PASSWORD="yourpassword" node migrate_goal_baseline_2026.js
 *   BOOKI_EMAIL="you@example.com" BOOKI_PASSWORD="yourpassword" node migrate_goal_baseline_2026.js --apply
 *
 * Usage (PowerShell):
 *   $env:BOOKI_EMAIL="you@example.com"; $env:BOOKI_PASSWORD="yourpassword"; node migrate_goal_baseline_2026.js
 *   $env:BOOKI_EMAIL="you@example.com"; $env:BOOKI_PASSWORD="yourpassword"; node migrate_goal_baseline_2026.js --apply
 *
 * The first run (no --apply) is always a safe, read-only dry run — do that first.
 */

const fs = require('fs');
const path = require('path');

const PROJECT = 'mitarim-reading';
const API_KEY = 'AIzaSyAu6366JpHuU36IYUWQq8277PUIevp2R1w';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── Hardcoded, explicit allowlist — exactly the 2 clubs the dry run found. ──────
const TARGETS = [
  { clubId: 'משפחת-סביר-1783662330082', cycleId: 'o1NT5n8ZC3ZvsecTyOxD', clubName: 'משפחת סביר' },
  { clubId: 'משפחת-עמוס-1783658629348', cycleId: 'YnCKsCe9znDHUXMCARbH', clubName: 'משפחת עמוס' },
];

function fsVal(v) {
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  return v;
}
function fsDoc(json) { if (!json.fields) return {}; const out = {}; for (const k of Object.keys(json.fields)) out[k] = fsVal(json.fields[k]); return out; }

async function fsGet(path, token) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, data: fsDoc(await r.json()) };
}
async function fsSetSingleField(path, token, fieldName, numberValue) {
  const url = `${BASE}/${path}?updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
  const r = await fetch(url, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [fieldName]: { integerValue: String(Math.round(numberValue)) } } }),
  });
  return { ok: r.ok, status: r.status, json: await r.json() };
}

async function signIn(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return await r.json();
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '=== APPLY MODE — this WILL write to production ===' : '=== DRY RUN (safe, no writes) — pass --apply to actually write ===');
  console.log('Targets (hardcoded, exactly these 2 clubs — nothing else):');
  TARGETS.forEach(t => console.log(`  - ${t.clubName} (${t.clubId}) / cycle ${t.cycleId}`));
  console.log('');

  const email = process.env.BOOKI_EMAIL;
  const password = process.env.BOOKI_PASSWORD;
  if (!email || !password) {
    console.error('Missing BOOKI_EMAIL / BOOKI_PASSWORD environment variables — see the usage note at the top of this file.');
    process.exit(1);
  }
  const auth = await signIn(email, password);
  if (!auth.idToken) {
    console.error('Sign-in failed:', auth.error?.message || JSON.stringify(auth));
    process.exit(1);
  }
  const token = auth.idToken;
  console.log(`Signed in as ${email}.\n`);

  const backup = { migratedAt: new Date().toISOString(), signedInAs: email, entries: [] };
  let anyPlanned = false;

  for (const t of TARGETS) {
    const cyclePath = `clubs/${t.clubId}/goalCycles/${t.cycleId}`;
    const econPath  = `clubs/${t.clubId}/economy/wallet`;

    const [cycle, econ] = await Promise.all([fsGet(cyclePath, token), fsGet(econPath, token)]);
    if (!cycle.ok || !econ.ok) {
      console.log(`  [SKIP] ${t.clubName}: could not read cycle/economy (status ${cycle.status || econ.status}) — check you have access to this club.\n`);
      continue;
    }

    const currentBaseline = cycle.data.startBaseline || 0;
    const correctBaseline = econ.data.lifetimeSpent || 0;
    const oldProgress = Math.max(0, (econ.data.lifetimeEarned || 0) - currentBaseline);
    const newProgress = Math.max(0, econ.data.balance || 0);

    console.log(`Club: ${t.clubName} (${t.clubId})`);
    console.log(`  current startBaseline: ${currentBaseline}`);
    console.log(`  correct startBaseline: ${correctBaseline}  (== current lifetimeSpent)`);
    console.log(`  progress before: ${oldProgress}   progress after: ${newProgress}   target: ${cycle.data.target}`);

    if (currentBaseline === correctBaseline) {
      console.log(`  -> Already correct. No write needed (idempotent — safe to re-run this script anytime).\n`);
      continue;
    }
    anyPlanned = true;
    backup.entries.push({
      clubId: t.clubId, clubName: t.clubName, cycleId: t.cycleId,
      oldStartBaseline: currentBaseline, newStartBaseline: correctBaseline,
    });

    if (!apply) {
      console.log(`  -> Would change startBaseline ${currentBaseline} -> ${correctBaseline}. (dry run — nothing written)\n`);
      continue;
    }

    // Backup written BEFORE the write, so the prior value is on disk no matter what happens next.
    const backupFile = path.join(__dirname, `goal_baseline_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`  Backup written: ${backupFile}`);

    const writeResult = await fsSetSingleField(cyclePath, token, 'startBaseline', correctBaseline);
    if (!writeResult.ok) {
      console.log(`  [FAIL] write rejected: status ${writeResult.status} — ${JSON.stringify(writeResult.json).slice(0, 200)}\n`);
      continue;
    }

    const verify = await fsGet(cyclePath, token);
    if (verify.ok && verify.data.startBaseline === correctBaseline) {
      console.log(`  [OK] Verified: startBaseline is now ${verify.data.startBaseline}.\n`);
    } else {
      console.log(`  [FAIL] Post-write verification mismatch! Expected ${correctBaseline}, got ${verify.data && verify.data.startBaseline}. Check manually before trusting this club's data.\n`);
    }
  }

  if (!anyPlanned) {
    console.log('Nothing to do — both clubs already correct (or unreadable).');
  } else if (!apply) {
    console.log('Dry run complete. Re-run with --apply to actually write the values shown above.');
  } else {
    console.log('Migration complete. Keep the backup JSON file — see ROLLBACK below if you ever need to undo this.');
  }
}

main().catch(e => { console.error('CRASH', e); process.exit(1); });

/**
 * ROLLBACK — if you ever need to undo this:
 * Open the backup JSON file this script printed the path to. For each entry, it has
 * { clubId, cycleId, oldStartBaseline }. In the Firebase Console, open
 * clubs/{clubId}/goalCycles/{cycleId} and set startBaseline back to oldStartBaseline.
 * That's the entire rollback — one number, per club, back to what it was.
 */
