# Schema

`schema.sql` is the canonical data model: PostgreSQL 16, per
ADR 0002 in the research repo.

It carries the research design in its triggers and CHECKs, not just its tables. Generate the ORM
model from it (`prisma db pull`), never the other way round.

## Running the tests

They need a throwaway Postgres. Nothing in them is destructive to anything but that database.

```sh
docker run -d --name hilabs-pg -e POSTGRES_PASSWORD=hilabs -e POSTGRES_DB=hilabs postgres:16-alpine
docker cp db/schema.sql      hilabs-pg:/tmp/schema.sql
docker cp db/test_schema.sql hilabs-pg:/tmp/test_schema.sql
docker exec hilabs-pg psql -U postgres -d hilabs -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql
docker exec hilabs-pg psql -U postgres -d hilabs -v ON_ERROR_STOP=1 -q -f /tmp/test_schema.sql
docker rm -f hilabs-pg
```

On Git Bash, prefix with `MSYS_NO_PATHCONV=1` or the `/tmp` paths get rewritten to Windows paths.

A failure raises and, with `ON_ERROR_STOP=1`, exits non-zero, so this drops straight into CI.

## Two things that will break the invariants

1. **A migration that recreates a table drops its triggers.** Re-run the `DO` block at the foot of
   `schema.sql`; `hilabs_observation_tables()` is the single list it iterates.
2. **Deleting a learner anywhere but `hilabs_erase_learner()`.** The delete order is a foreign-key
   dependency order and a hand-written copy of it will drift. The API calls that function and
   nothing else deletes a learner.
