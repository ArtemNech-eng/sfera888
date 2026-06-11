# Legacy migrations (archived)

These hand-written SQL files were never wired into an automatic runner —
their effect on the production DB was applied earlier through one of the
ad-hoc paths (`runMigrations()` in `api-server/src/index.ts`,
`scripts/db-migrate.ts`, or manually).

We've switched to the standard `drizzle-kit generate` + `migrate()` flow.
See `lib/db/migrations/` for the new, automated pipeline and
`lib/db/README.md` for the workflow.

These files are kept for historical reference only — **do not run them
against the database**. Their contents are already covered by the new
baseline migration.
