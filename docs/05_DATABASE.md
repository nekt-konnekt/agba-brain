# 05 Database

## Database rules

Agba uses PostgreSQL through Supabase. All tenant-owned records carry `organization_id`. Operational records that belong to a department also carry `department_id` where applicable.

The database is the authorization boundary. RLS must remain enabled on tenant data.

## Core entities

| Entity | Purpose |
|---|---|
| organizations | Company tenant and configuration |
| roles | CEO, Department Head, and future roles |
| users | Agba identity linked to Supabase Auth |
| departments | Company structure |
| reports | Raw departmental or CEO submissions |
| report_entries | Normalized facts extracted from a report |
| metrics | Named operational or financial measurements |
| tasks | Work commitments and status |
| expenses | Company expense records |
| revenue_records | Revenue records and signals |
| events | Time-bound company events |
| observations | Agba's structured observations |
| issues | Risks, blockers, and problems |
| decisions | Decisions made by authorized people |
| approvals | Approval requests and outcomes |
| goals | Department and company goals |
| context_items | Durable company memory |
| relationships | Links between business records |
| conversations | User conversations with Agba |
| messages | Conversation messages |
| evidence_links | Traceability from conclusions to source records |
| audit_logs | Security and material state-change history |

## Scope model

```text
CEO
 └── organization-wide read access

Department Head
 └── own department read/write access
     └── organization context explicitly permitted by policy
```

A Department Head is never given another department's private records merely because a model can infer them.

## Important implementation detail

The existing Supabase project contains unrelated public tables. Agba therefore uses the `agba_` prefix in the physical schema to avoid collisions. This is a namespace decision, not a change to the logical model.

## Source of truth

`supabase/migrations/` contains executable database changes. This document describes the logical contract. Migration names are timestamped and immutable once applied.