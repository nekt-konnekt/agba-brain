# Agba Decisions

| Decision | Choice | Reason |
|---|---|---|
| Product name | Agba | Product identity |
| Repository | agba-brain | Engineering repository name |
| Primary users | CEO + Department Heads | Small operational V1 |
| Department Head access | Department-scoped by default | Prevent accidental company-wide disclosure |
| CEO interface | Agba's Office | Human operating cockpit, not generic dashboard |
| Reporting input | Natural language first | Lowest friction for daily reporting |
| Company memory | Structured records + evidence | Makes reasoning traceable |
| Authorization | PostgreSQL RLS + app policy | Model must not be the security boundary |
| Source reports | Preserve raw text | Auditability and reprocessing |
| Consequential actions | Human approval in V1 | Avoid premature autonomy |
| Physical table namespace | `agba_` | Existing Supabase project already contains unrelated public tables |
| Repository source of truth | Readable Markdown + SQL | ZIPs remain historical artifacts only |

## Current implementation decision

The repository is being converted from an artifact-only upload into the actual Agba source tree on branch `feat/agba-v1-foundation`. Main remains untouched until the foundation is reviewed.