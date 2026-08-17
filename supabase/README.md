# Agba Supabase

The SQL in `migrations/` is the database source of truth for Agba V1.

## Migration policy

- Never edit an applied migration.
- Add a new timestamped migration for changes.
- Keep destructive changes explicit.
- Keep RLS enabled on tenant data.
- Test policies with CEO and Department Head identities before shipping.

## Current migration

`20260817120000_001_agba_v1_core.sql`

Creates the Agba V1 schema, indexes, private authorization helpers, timestamp trigger, and initial RLS policies.

## Namespace

Agba uses `public.agba_*` tables because the connected Supabase project already contains unrelated public tables. This prevents collisions while keeping standard Supabase/Postgres tooling available.