-- Agba V1 Reporting Ingestion
-- Adds replay protection and correction provenance without rewriting source reports.

alter table public.agba_reports
  add column if not exists idempotency_key text,
  add column if not exists supersedes_report_id uuid references public.agba_reports(id) on delete set null;

create unique index if not exists uq_agba_reports_idempotency
on public.agba_reports (organization_id, idempotency_key)
where idempotency_key is not null;

create index if not exists idx_agba_reports_supersedes
on public.agba_reports (supersedes_report_id);

create index if not exists idx_agba_report_entries_org_type_date
on public.agba_report_entries (organization_id, entry_type, occurred_on desc);

create index if not exists idx_agba_evidence_source
on public.agba_evidence_links (organization_id, source_type, source_id);

-- Department Heads may create reports only for their own department.
-- CEOs may create company-level reports or department reports.
create policy "agba reports update own scope" on public.agba_reports
for update to authenticated
using (
  organization_id = agba_private.current_org_id()
  and (
    agba_private.is_ceo()
    or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())
  )
)
with check (
  organization_id = agba_private.current_org_id()
  and (
    agba_private.is_ceo()
    or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())
  )
);

-- Entries remain append-oriented. Corrections should arrive through a new report
-- and provenance links rather than destructive edits to extracted evidence.
