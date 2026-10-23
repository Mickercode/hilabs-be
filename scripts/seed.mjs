/**
 * Loads the task catalogue into the database.
 *
 * Idempotent: tasks are matched on (kind, code, tier, version), which is the unique key, so this
 * can be run on every deploy. It only ever writes to `task`, which is a record table — it does
 * not touch a single observation, so there is no way for a reseed to disturb a learner's work.
 *
 * Changing the wording of a task after learners have answered it would make two learners'
 * answers incomparable, and the rubric is written against the exact wording. So a change ships as
 * a new `version`, never as an edit to v1.
 *
 * Run:  npm run db:seed
 */
import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const catalogue = JSON.parse(
  await readFile(fileURLToPath(new URL('../db/seed/tasks.json', import.meta.url)), 'utf8'),
);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

let inserted = 0;
let updated = 0;
let unchanged = 0;

try {
  await client.query('BEGIN');

  for (const task of catalogue.tasks) {
    const existing = await client.query(
      `SELECT id, title, body, gim_domain FROM task
        WHERE kind = $1 AND code = $2 AND tier = $3 AND version = $4`,
      [task.kind, task.code, task.tier, catalogue.version],
    );

    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO task (kind, code, gim_domain, title, body, tier, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          task.kind,
          task.code,
          task.gimDomain ?? null,
          task.title,
          task.body,
          task.tier,
          catalogue.version,
        ],
      );
      inserted += 1;
      continue;
    }

    const row = existing.rows[0];
    const same =
      row.title === task.title &&
      row.body === task.body &&
      row.gim_domain === (task.gimDomain ?? null);

    if (same) {
      unchanged += 1;
      continue;
    }

    await client.query(
      `UPDATE task SET title = $1, body = $2, gim_domain = $3 WHERE id = $4`,
      [task.title, task.body, task.gimDomain ?? null, row.id],
    );
    updated += 1;
    console.warn(
      `  ! ${task.kind}/${task.code} tier ${task.tier} changed within version ${catalogue.version}.`,
    );
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(`\n${error.message}`);
  process.exitCode = 1;
  await client.end();
  process.exit();
}

const required = await client.query(
  `SELECT gim_domain, code FROM task
    WHERE kind = 'discovery' AND tier = 0 AND version = $1
    ORDER BY code`,
  [catalogue.version],
);

const DOMAINS = ['cognitive', 'analytical', 'creative', 'emotional', 'adaptive', 'instinctive'];
const covered = new Set(required.rows.map((r) => r.gim_domain));
const missing = DOMAINS.filter((d) => !covered.has(d));

await client.end();

console.log(`\nTask catalogue ${catalogue.version}`);
console.log(`  ${inserted} inserted, ${updated} updated, ${unchanged} already current`);
console.log(`  ${required.rowCount} required Discovery attempts: ${required.rows.map((r) => r.code).join(', ')}`);

// Section 5.2 asks Discovery to expose a learner to all six domains. A gap here is not a warning,
// it is a pilot that does not do what it says it does.
if (missing.length > 0) {
  console.error(`\n  Discovery does not cover: ${missing.join(', ')}`);
  console.error('  Section 5.2 requires all six. Fix the catalogue before running the pilot.');
  process.exitCode = 1;
} else {
  console.log('  all six GIM domains covered');
}
