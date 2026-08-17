# Reporting Ingestion API

## Purpose

Accept a natural-language department or CEO report, preserve the original evidence, and create the canonical `agba_reports` record. Extraction and reasoning happen after ingestion.

## Endpoint

`POST /functions/v1/report-ingestion`

Requires a Supabase Auth bearer token.

## Request

```json
{
  "report_text": "Sales today was ₦420k. Two orders are waiting for payment. We spent ₦35k on delivery. Ada will follow up tomorrow.",
  "report_date": "2026-08-17",
  "department_id": "uuid",
  "source": "conversation",
  "idempotency_key": "sales-2026-08-17-001",
  "supersedes_report_id": null
}
```

`report_text` is required. The remaining fields are optional. A Department Head may only submit for their own department. A CEO may submit company-level or department-level reports.

## Response

```json
{
  "report": {
    "id": "uuid",
    "organization_id": "uuid",
    "department_id": "uuid",
    "submitted_by": "uuid",
    "report_date": "2026-08-17",
    "status": "received"
  },
  "replayed": false,
  "next": "classification"
}
```

## Pipeline

```text
POST report
   ↓
Persist immutable raw evidence
   ↓
Classify
   ↓
Extract entries
   ↓
Validate confidence / ambiguity
   ↓
Persist normalized records
   ↓
Evidence links
   ↓
Observations / reasoning
```

The ingestion endpoint intentionally does **not** invent structured facts. It only accepts the authenticated user's report and establishes provenance.

## Idempotency

Use either the `Idempotency-Key` header or `idempotency_key` request field. Replaying the same key within an organization returns the original report instead of creating a duplicate.

## Corrections

Corrections create a new report and may reference the earlier report with `supersedes_report_id`. The original report remains auditable.
