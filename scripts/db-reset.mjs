// Applies db/schema.sql to DATABASE_URL, dropping whatever was there first.
// Development only: it refuses to run against anything that is not localhost.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const { hostname, pathname } = new URL(url);
if (!["localhost", "127.0.0.1", "db"].includes(hostname)) {
  console.error(`Refusing to reset a non-local database (${hostname}).`);
  process.exit(1);
}

const database = pathname.replace(/^\//, "");
const admin = new URL(url);
admin.pathname = "/postgres";

const psql = (target, args) =>
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", target.toString(), ...args], {
    stdio: "inherit",
  });

psql(admin, ["-c", `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`]);
psql(admin, ["-c", `CREATE DATABASE ${database}`]);
psql(url, ["-f", "db/schema.sql"]);

console.log(`\n${database} reset from db/schema.sql`);
if (process.argv.includes("--test")) {
  psql(url, ["-f", "db/test_schema.sql"]);
}
