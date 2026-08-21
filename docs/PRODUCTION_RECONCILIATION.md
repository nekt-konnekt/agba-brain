# Production reconciliation runbook

Agba currently has two sources that drifted:

1. GitHub contains the intended source code and only part of the database migration history.
2. `agba-prod` contains the latest working database schema, migration history, and deployed Edge Functions.

## Current facts

- Production project: `iijhsdaqaqywzpavdonn`
- Production migration history: 49 entries
- GitHub migration files: 14 entries
- Production has deployed Edge Functions whose source has diverged from some repository files.
- The production Telegram worker is newer than the repository worker.

## Reconciliation order

1. Capture the production public schema into `supabase/production-schema.sql`.
2. Compare the captured schema against a clean local reset of the repository migrations.
3. Generate and review one reconciliation migration for the missing schema delta.
4. Verify the resulting migration chain with a clean `supabase db reset`.
5. Only after verification, repair the remote migration history so GitHub and production report the same migration set.
6. Compare every deployed Edge Function with the repository version.
7. Deploy only the repository versions after the database contract is verified.
8. Run the complete E2E suite against production.
9. Merge the reconciliation PR.

## Safety rules

- Do not run `supabase db reset --linked` against `agba-prod`.
- Do not delete production rows to make tests pass.
- Do not mark a migration reverted until its schema changes are represented by the reconciliation baseline.
- Do not merge code that depends on a database function or column absent from the migration chain.
- Do not treat a passing E2E test as proof that migration history is correct.

## Required secret for the reconciliation workflow

The GitHub workflow accepts either:

- `SUPABASE_DB_URL`, preferably the Supavisor session connection string, or
- `SUPABASE_DB_PASSWORD`.

The workflow only reads the database. It does not repair migration history automatically.

## Definition of done

GitHub is the only source of truth for application code and database schema. A clean clone can reset the database successfully, Edge Functions are deployable from the repository, production migration history matches the repository, and the full E2E suite passes without test-only production fixtures or manual database edits.
