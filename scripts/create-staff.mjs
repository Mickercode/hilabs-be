/**
 * Creates a staff account: a researcher, a rater, or an admin.
 *
 * There is deliberately no endpoint for this. Learners create their own accounts; staff access
 * is granted deliberately, by someone with the database, and leaves a row rather than a
 * self-service signup anyone could find.
 *
 * Run:  npm run staff:create -- --email you@example.org --kind researcher --name "Your Name"
 *
 * The password is read from STAFF_PASSWORD, or generated and printed once. It is hashed with
 * the same helper the API uses, imported from dist so the two can never drift.
 */
import 'dotenv/config';

import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

import { hashPassword } from '../dist/common/auth/password.js';

const KINDS = ['researcher', 'rater', 'admin'];

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    kind: { type: 'string' },
    name: { type: 'string' },
  },
});

const email = values.email?.trim().toLowerCase();
const kind = values.kind;

if (!email || !kind) {
  console.error('Usage: npm run staff:create -- --email <address> --kind <researcher|rater|admin> [--name "Name"]');
  process.exit(1);
}

if (!KINDS.includes(kind)) {
  console.error(`--kind must be one of: ${KINDS.join(', ')}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const generated = !process.env.STAFF_PASSWORD;
const password = process.env.STAFF_PASSWORD ?? randomBytes(12).toString('base64url');

if (password.length < 10) {
  console.error('STAFF_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('BEGIN');

  const existing = await client.query('SELECT id FROM account WHERE lower(email) = $1', [email]);
  if (existing.rowCount > 0) {
    throw new Error(`There is already an account for ${email}.`);
  }

  const account = await client.query(
    `INSERT INTO account (kind, email, display_name) VALUES ($1, $2, $3) RETURNING id`,
    [kind, email, values.name ?? null],
  );

  await client.query(
    `INSERT INTO credential (account_id, type, secret_hash) VALUES ($1, 'password', $2)`,
    [account.rows[0].id, await hashPassword(password)],
  );

  await client.query('COMMIT');

  console.log(`\nCreated ${kind} account for ${email}`);
  if (generated) {
    console.log(`Password: ${password}`);
    console.log('\nThis is the only time it is shown. Send it over something other than email,');
    console.log('and have them change it once password changes exist.');
  }
} catch (error) {
  await client.query('ROLLBACK');
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
