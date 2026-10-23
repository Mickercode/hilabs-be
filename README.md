# hilabs-be

The HiLabs API: NestJS, PostgreSQL, and the database that holds the research design.

HiLabs is a learning platform and a research study. The first pilot tests one claim from the
Human Intelligence Models thesis — that the osmotic phase between Discovery and Tailored
Instruction cannot be skipped — as a two-arm comparison over four weeks.

## Stack

| | |
| --- | --- |
| Runtime | Node 22 |
| Framework | NestJS 12 |
| Database | PostgreSQL 16 |
| Types from the database | Prisma Client 7, via introspection |

## The one rule that matters

**The schema owns the model. The ORM does not.**

`db/schema.sql` carries the research design in its triggers and CHECKs: observations are
append-only, deletes are gated behind an authorised erasure, a companion explanation cannot be
written without citing a real resource, and a GIM hypothesis with a missing signal cannot be
classified as strong. An ORM migration will happily drop all of it.

- Generate the Prisma model **from** the database (`npx prisma db pull`), never the reverse.
- Write migrations as hand-written SQL in `db/migrations/`.
- **Any migration that recreates a table drops its triggers.** Re-run the `DO` block at the foot
  of `db/schema.sql`; `hilabs_observation_tables()` is the single list it iterates.
- Nothing deletes a learner except `hilabs_erase_learner()`. The delete order is a foreign-key
  dependency order and a copy of it in TypeScript will drift.

`db/test_schema.sql` is the guard. CI applies the schema to a throwaway Postgres and runs it on
every push and pull request. It is not optional.

## Getting started

```sh
cp .env.example .env          # then fill in DATABASE_URL
docker compose up -d db       # or point DATABASE_URL at your own Postgres
npm ci
npm run db:reset              # applies db/schema.sql
npm run start:dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run start:dev` | API with reload |
| `npm run db:reset` | Drops and recreates the schema from `db/schema.sql` |
| `npm run db:test` | Runs the invariant tests against `DATABASE_URL` |
| `npm run db:pull` | Regenerates the Prisma model from the live database |
| `npm run lint` / `npm test` / `npm run build` | As usual |

## Branches

`production` and `staging`, feature branches off `staging`. See [CONTRIBUTING.md](CONTRIBUTING.md).
