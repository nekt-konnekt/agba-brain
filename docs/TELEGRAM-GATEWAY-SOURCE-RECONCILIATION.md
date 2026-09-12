# Telegram gateway source reconciliation

On 2026-09-12, production Supabase `telegram-gateway` version 68 was inspected and its deployed `index.ts` was reconciled into this branch.

Production SHA: `845747f266db9c3e017836b1c71ef4dc0cdb31dc59fa8d9b0dcd054ebdd38bb3`

The reconciled source preserves the production temporal-truth guard: current business date is explicit, `report_date` governs historical relative language, and historical evidence is not described as happening today unless supported by evidence.

This change is source reconciliation only. No product behavior beyond the already-validated production version is intended.