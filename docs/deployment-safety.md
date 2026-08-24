# Deployment Safety — UniquePOS

## Purpose

Database migrations are no longer part of normal application startup. A normal application deploy may start the POS, but it cannot silently apply a pending migration or execute a destructive data operation.

## Normal application startup

`app.js` validates the environment, builds the runtime bundle, verifies that the required database tables already exist, disables any internal startup-migration path before loading the application bundle, and starts the server.

If required tables are missing, startup fails with an instruction to run the explicit migration deployment step. Startup does **not** call `applyMigrations()`.

## Explicit migration deployment

The only supported migration deployment command is:

```text
npm run db:migrate
```

This invokes `scripts/deploy-migrations.cjs`.

The deployment process requires:

- `MIGRATION_DEPLOY_TOKEN`: a separate 32+ character deployment secret that is not used by normal application startup.
- `MIGRATION_CONFIRMATION=APPLY_MIGRATIONS`: an explicit operator confirmation.
- A migration audit against the target database before migration execution.

The deployment script checks `schema_migrations` and the repository's `migration-safety.json` policy before calling the migration engine.

## Destructive migration policy

A migration is classified as destructive when its executable SQL contains data-destructive operations such as `TRUNCATE`, `DELETE FROM`, destructive `DROP`, or destructive `CASCADE` usage.

A pending destructive migration cannot run merely because it is in the migrations directory. It requires all of the following:

1. Written approval for the specific migration file(s).
2. `MIGRATION_ALLOW_DESTRUCTIVE=YES`.
3. `MIGRATION_DESTRUCTIVE_APPROVAL=APPROVE_DESTRUCTIVE_MIGRATION`.
4. `MIGRATION_APPROVED_FILES` containing every specifically approved pending destructive migration filename.
5. A fresh PostgreSQL custom-format backup created immediately before execution by `scripts/backup-before-migration.cjs`.
6. The backup must exist, be non-empty, and be no older than 15 minutes when the migration begins.

The deployment script creates that backup only after the explicit destructive approval checks have passed. If `pg_dump` fails, no migration is executed.

## Historical destructive migrations

The following known historical cleanup migrations are marked `retired` and therefore **must never execute automatically**, even with the destructive gate:

- `0011_production_clean_start.sql`
- `0012_clear_stale_bulk_import_history.sql`
- `0013_production_clear_product_catalog.sql`
- `0014_force_clean_test_catalog.sql`
- `0023_production_catalog_clean_slate.sql`
- `0023_production_catalog_wipe.sql`
- `0023_production_clean_slate_catalog.sql`
- `0026_inventory_clean_start.sql`

These files contain explicit production cleanup/wipe behavior. Their production-applied state must be checked on the real target database using:

```text
npm run db:migration-audit
```

A result of `pending` for any retired migration is a deployment blocker. It must be resolved by a separately reviewed migration/history reconciliation; it must not be allowed to run as part of an ordinary deploy.

The audit also scans every other migration. If a new destructive migration is introduced without a policy entry, it is treated as `review` and will block deployment when pending until explicitly reviewed.

## Production reset utility

`production-reset.cjs` no longer has the previous `all` + `CASCADE` mode.

The remaining `test` and `catalog` scopes are still destructive operations. They require:

- explicit `RESET_ALLOW=YES`;
- `RESET_APPROVED_SCOPE` matching the exact requested scope;
- the existing scope-specific confirmation string;
- a fresh database backup created immediately before execution;
- no PostgreSQL `CASCADE` reset operation.

The catalog reset uses a table allow-list and checks product foreign-key references before deleting anything. If protected transactional references exist, it aborts without deleting data.

## Rollback plan

Migrations are applied in individual transactions by the existing migration engine. For a destructive migration, the pre-migration `pg_dump` is the rollback artifact. If the migration fails or the resulting state is unacceptable, stop the application deployment and restore the database from that dump before retrying.

A restore is intentionally an operator-controlled recovery operation; the application never performs an automatic destructive restore.

## Review before merge

Every migration PR must answer:

1. Does the SQL contain `TRUNCATE`, `DELETE FROM`, destructive `DROP`, or destructive `CASCADE`?
2. Does it change production data, or only schema/metadata?
3. If destructive, why is that operation required and what is the rollback dump?
4. Is the migration safe to run once, and is it safe to leave pending?
5. Has the target production `schema_migrations` state been audited?
6. Has the regression/staging safety test passed?

Destructive migrations must not be merged as ordinary schema maintenance. They require an explicit review record and target-environment approval before deployment.

## Staging proof

The regression workflow contains a staging-style PostgreSQL deployment-safety job. It verifies that:

- the application starts against a database with a complete schema without applying migrations;
- a sentinel database row survives startup;
- the migration safety scanner identifies pending destructive migrations;
- a normal deployment cannot bypass the migration gate;
- the explicit migration command requires the separate deployment credential.

No production database is modified by this test.
