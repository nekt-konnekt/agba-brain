# Agba Supabase

The SQL in `migrations/` is intended to be the database source of truth for Agba V1.

## Migration policy

- Never edit an applied migration.
- Add a new timestamped migration for changes.
- Keep destructive changes explicit.
- Keep RLS enabled on tenant data.
- Test policies with CEO and Department Head identities before shipping.
- Production must be reproducible from the repository migration history.

## Reconciliation status

The connected production project currently contains migrations through `20260821033422_fix_management_open_actions_metadata`.

The reconciliation branch does **not** yet contain the complete production migration history. Do not treat the repository migration directory as a complete representation of production until the drift is reconciled.

See `docs/PRODUCTION_DRIFT.md` for the observed migration gap and the recovery plan.

## Namespace

Agba uses `public.agba_*` tables because the connected Supabase project already contains unrelated public tables. This prevents collisions while keeping standard Supabase/Postgres tooling available.
