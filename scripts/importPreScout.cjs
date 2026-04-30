/**
 * Pre-scout CSV → Firestore import (CLI backup for the importPreScoutData Cloud Function).
 *
 * Use when you can't (or don't want to) run the Cloud Function — e.g., debugging
 * the column mapping, importing from a local file, or doing bulk re-imports
 * without burning function invocations.
 *
 * Usage:
 *   node scripts/importPreScout.cjs --sheet=<csv-export-url>
 *   node scripts/importPreScout.cjs --csv=./prescout.csv
 *   node scripts/importPreScout.cjs --sheet=<url> --dry-run
 *
 * Requires:
 *   - scripts/serviceAccountKey.json (Firebase Admin service account)
 *   - functions/node_modules (for firebase-admin + papaparse — share with Cloud Functions)
 */

const path = require('path');
const fs = require('fs');

// Share dependencies with functions/node_modules — same pattern as cleanup_pictures.cjs
const functionsPath = path.join(__dirname, '..', 'functions');
const adminAppPath = require.resolve('firebase-admin/app', { paths: [functionsPath] });
const adminFsPath = require.resolve('firebase-admin/firestore', { paths: [functionsPath] });
const papaPath = require.resolve('papaparse', { paths: [functionsPath] });

const { initializeApp, cert } = require(adminAppPath);
const { getFirestore, FieldValue } = require(adminFsPath);
const Papa = require(papaPath);

// Shared row-mapping logic (one source of truth with the Cloud Function)
const { parseCsv } = require(path.join(functionsPath, 'preScoutMapping.js'));

// ── Args ────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);

const dryRun = args['dry-run'] === 'true';
const sheetUrl = args.sheet;
const csvPath = args.csv;

if (!sheetUrl && !csvPath) {
  console.error('Usage: --sheet=<url> OR --csv=<path> [--dry-run]');
  process.exit(1);
}

// ── Firebase init ───────────────────────────────────────────────────────────

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const csvText = csvPath
    ? fs.readFileSync(path.resolve(csvPath), 'utf8')
    : await (async () => {
        console.log(`Fetching: ${sheetUrl}`);
        const r = await fetch(sheetUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.text();
      })();

  const { entries, skipped, originEvents } = parseCsv(csvText, Papa);

  console.log(`\nParsed ${entries.length} entries (skipped ${skipped} invalid/empty rows)`);
  console.log(`\nOrigin events:`);
  for (const [eventKey, info] of Object.entries(originEvents)) {
    console.log(`  ${eventKey.padEnd(15)}  ${info.entries} entries  (${info.teams} teams)`);
  }

  if (dryRun) {
    console.log('\nDry run — no writes performed.');
    return;
  }

  console.log('\nWriting to preScoutEntries/...');
  let batch = db.batch();
  let opsInBatch = 0;
  let totalWritten = 0;
  for (const entry of entries) {
    batch.set(db.doc(`preScoutEntries/${entry.id}`), entry, { merge: true });
    opsInBatch++;
    totalWritten++;
    if (opsInBatch >= 450) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
      process.stdout.write(`\r  ${totalWritten}/${entries.length}`);
    }
  }
  if (opsInBatch > 0) await batch.commit();
  process.stdout.write(`\r  ${totalWritten}/${entries.length}\n`);

  await db.doc('config/preScout').set(
    {
      sheetUrl: sheetUrl || `file://${csvPath}`,
      lastImportAt: FieldValue.serverTimestamp(),
      lastImportBy: 'cli',
      lastImportStats: {
        totalEntries: entries.length,
        skippedRows: skipped,
        originEvents,
      },
    },
    { merge: true }
  );

  console.log('Done.');
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
