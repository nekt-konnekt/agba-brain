# Agba production drift register

Generated from the connected production Supabase project `agba-prod` (`iijhsdaqaqywzpavdonn`) and the GitHub branch `reconcile/prod-source-of-truth`.

## Current state

Production Supabase has migrations through:

`20260821033422_fix_management_open_actions_metadata`

The GitHub reconciliation branch does not currently contain all production migrations. The repository migration directory currently contains the original V1 migrations plus a small number of later lifecycle/reliability migrations. Therefore GitHub cannot currently reproduce the production database from its migration history alone.

## Production migrations missing from the reconciliation branch

The following production migration versions were observed in Supabase but are not represented by the current repository migration set:

- 20260817132920 `agba_v1_core`
- 20260817132925 `agba_reasoning_briefing`
- 20260817132951 `agba_office`
- 20260817133221 `agba_rls_helpers_and_policies`
- 20260817141708 `company_setup_completion_fields`
- 20260817153938 `company_setup_service_role_grants`
- 20260817170915 `company_state_layer`
- 20260817172718 `add_validated_briefing_status`
- 20260817211312 `grant_authenticated_report_select_for_rls`
- 20260817211535 `grant_authenticated_agba_users_select_for_rls`
- 20260817212006 `harden_authenticated_table_privileges`
- 20260819115830 `telegram_invitations`
- 20260819124653 `role_aware_confirmed_memory`
- 20260819124658 `telegram_roles`
- 20260819124708 `prevent_self_confirmation`
- 20260819125825 `enforce_v1_roles_and_departments`
- 20260819144601 `repair_ceo_query_actions_dependencies`
- 20260819203406 `clean_supplier_action_duplicates`
- 20260819204831 `action_history_memory`
- 20260819205848 `fix_completed_action_severity_enum_cast`
- 20260819213321 `action_lifecycle_dedup_production_fix`
- 20260820114420 `action_execution_engine`
- 20260820182546 `add_telegram_update_inbox`
- 20260820202346 `telegram_reliability_queue`
- 20260820202434 `telegram_worker_secret_rpc`
- 20260820202542 `telegram_worker_processing_status`
- 20260820231810 `add_authoritative_management_actions_view`
- 20260820232530 `guard_informational_ceo_action_inserts`
- 20260820233642 `fix_informational_ceo_action_guard`
- 20260820234052 `enforce_authoritative_action_answer_consistency`
- 20260820234910 `prevent_chat_transcript_confirmation_as_business_report`
- 20260821002627 `make_authoritative_action_answer_enforcement_bidirectional`
- 20260821002645 `tighten_authoritative_action_answer_cleanup`
- 20260821002658 `finish_authoritative_action_answer_cleanup`
- 20260821003349 `canonical_action_execution_v1`
- 20260821004141 `add_evidence_provenance_contract`
- 20260821005049 `auto_provenance_for_report_ingestion`
- 20260821005632 `add_intent_classification_contract`
- 20260821005648 `fix_report_evidence_intent_detection`
- 20260821010144 `harden_telegram_queue_retry_contract`
- 20260821010455 `add_telegram_scheduler_contract`
- 20260821010638 `add_telegram_delivery_outbox`
- 20260821011552 `canonical_management_action_resolver`
- 20260821011628 `fix_canonical_action_resolution_completed_state`
- 20260821020349 `harden_internal_rpc_execution`
- 20260821020410 `remove_public_rpc_execute_grants`
- 20260821021412 `harden_scheduler_cadence_and_duplicate_indexes`
- 20260821022400 `harden_telegram_retry_leases`
- 20260821022408 `remove_legacy_delivery_claim_signature`
- 20260821023613 `enforce_telegram_delivery_idempotency`
- 20260821033422 `fix_management_open_actions_metadata`

## Important rule

Do not fabricate these missing migration files from their names. The SQL must be recovered from the actual production schema/history or from the original commits that applied them.

## Next reconciliation step

1. Export the production migration SQL or recover the exact SQL from the commits/workspace that created these migrations.
2. Commit the recovered migrations to GitHub in the same order.
3. Verify that a fresh database can reproduce the production schema from GitHub migrations.
4. Only after that, address security/performance findings and application-level E2E failures.

This document is intentionally a register, not a claim that the missing SQL has been reconstructed.
