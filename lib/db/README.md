# `@workspace/db`

Drizzle ORM schema, connection and migration sources for the project.

## Layout

- `src/schema/*.ts` — Drizzle table definitions, the single source of truth.
- `src/index.ts` — exports the configured `db` and connection pool.
- `migrations/` — generated SQL migrations (managed by `drizzle-kit`, **do not edit by hand**).
- `migrations-legacy/` — pre-baseline hand-written SQL files, kept for history. **Do not run against the database.**

## How migrations work

The api server applies migrations on every start via
`runDrizzleMigrations()` in `artifacts/api-server/src/lib/migrate.ts`:

1. If `drizzle.__drizzle_migrations` is missing on a non-empty database
   (existing prod), the runner first marks the baseline migration
   (`0000_baseline.sql`) as already applied. This is a one-time bootstrap.
2. `drizzle-orm/migrator` then applies any unrecorded files from
   `migrations/` in order and writes a row per migration into
   `drizzle.__drizzle_migrations`.

Runtime fixes that the schema can't express (for example partial
unique indexes, `CHECK` constraints, sequence resyncs, idempotent
`INSERT INTO system_settings`) live in `runRuntimeFixes()` inside
`artifacts/api-server/src/index.ts` and run right after the
schema migrations.

## Adding a schema change

1. Edit a file in `src/schema/`.
2. Generate the diff:
   ```bash
   pnpm --filter @workspace/db exec drizzle-kit generate --name=<short_change_description>
   ```
   This creates `migrations/<NNNN>_<name>.sql` and updates
   `migrations/meta/_journal.json`.
3. Review the generated SQL. Drizzle is conservative — destructive
   changes (drops, type narrowing, `NOT NULL` without default) need a
   manual audit before committing.
4. Commit the schema file **and** the generated migration files together.

That's it — the next deploy applies the migration automatically.

## Local commands

| Command                                                | Purpose                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `pnpm --filter @workspace/db exec drizzle-kit generate`| Generate a new migration from schema diff                                 |
| `pnpm --filter @workspace/db exec drizzle-kit check`   | Sanity-check the journal/SQL files                                        |
| `pnpm --filter @workspace/db push`                     | Push schema directly to a dev DB **without** generating a migration       |

`push` skips the migration files and writes the schema directly. Useful
in early prototyping; **do not run it against production** — it will
diverge prod from the migration history.

## Bootstrapping a fresh database

Just point `DATABASE_URL` at an empty Postgres instance and start the
api server. `runDrizzleMigrations()` will detect the empty DB, run
`0000_baseline.sql` plus any later migrations, then `runRuntimeFixes()`
applies the seeds and constraints that aren't in the schema.
