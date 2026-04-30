// Clean up stale robot picture docs from Firestore where the image URL is dead.
// Usage: node scripts/cleanup_pictures.cjs [--dry-run]
//
// Reads all docs from robotPictures/2026/pictures, HEAD-checks each URL,
// and deletes docs whose images return non-200.

const path = require('path');

// firebase-admin lives in functions/node_modules
const adminAppPath = require.resolve('firebase-admin/app', { paths: [path.join(__dirname, '..', 'functions')] });
const adminFsPath = require.resolve('firebase-admin/firestore', { paths: [path.join(__dirname, '..', 'functions')] });
const { initializeApp, cert } = require(adminAppPath);
const { getFirestore } = require(adminFsPath);

const DRY_RUN = process.argv.includes('--dry-run');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function run() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no deletes)' : 'LIVE — will delete stale docs'}\n`);

  const snapshot = await db.collection('robotPictures/2026/pictures').get();
  console.log(`Found ${snapshot.size} picture docs in Firestore\n`);

  const stale = [];
  const alive = [];

  // Check URLs in batches of 20 to avoid hammering the server
  const docs = snapshot.docs;
  const BATCH = 20;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (doc) => {
        const data = doc.data();
        const url = data.robot_image_link;
        const ok = await checkUrl(url);
        return { doc, data, ok };
      })
    );
    for (const { doc, data, ok } of results) {
      if (ok) {
        alive.push(data.team_number);
      } else {
        stale.push({ id: doc.id, team: data.team_number, url: data.robot_image_link });
      }
    }
    process.stdout.write(`  Checked ${Math.min(i + BATCH, docs.length)}/${docs.length}\r`);
  }

  console.log(`\n\nResults:`);
  console.log(`  Alive: ${alive.length}`);
  console.log(`  Stale: ${stale.length}\n`);

  if (stale.length === 0) {
    console.log('Nothing to clean up!');
    return;
  }

  // Show stale entries grouped by team
  const byTeam = new Map();
  for (const s of stale) {
    if (!byTeam.has(s.team)) byTeam.set(s.team, []);
    byTeam.get(s.team).push(s);
  }
  for (const [team, entries] of [...byTeam.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Team ${team}: ${entries.length} stale photo(s)`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no docs deleted. Remove --dry-run to delete.');
    return;
  }

  // Delete in Firestore batches of 500
  console.log(`\nDeleting ${stale.length} stale docs...`);
  const FB_BATCH = 500;
  for (let i = 0; i < stale.length; i += FB_BATCH) {
    const writeBatch = db.batch();
    const slice = stale.slice(i, i + FB_BATCH);
    for (const s of slice) {
      writeBatch.delete(db.doc(`robotPictures/2026/pictures/${s.id}`));
    }
    await writeBatch.commit();
    console.log(`  Deleted ${Math.min(i + FB_BATCH, stale.length)}/${stale.length}`);
  }

  console.log('\nDone! Stale picture docs removed from Firestore.');
}

run().catch(err => { console.error(err); process.exit(1); });
