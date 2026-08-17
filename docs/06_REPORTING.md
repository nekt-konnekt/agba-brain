# 06 Reporting

## The reporting loop

A Department Head should be able to send something as simple as:

> Sales today was ₦420k. Two orders are waiting for payment. We spent ₦35k on delivery. Ada will follow up tomorrow.

Agba turns that into structured records without forcing the user to fill a form.

## Ingestion pipeline

```text
User message
   ↓
Create raw report
   ↓
Classify content
   ↓
Extract structured entries
   ↓
Validate / detect ambiguity
   ↓
Persist normalized records
   ↓
Link evidence
   ↓
Update observations / memory
   ↓
Acknowledge + surface important issues
```

## Extraction categories

- metric
- task
- expense
- revenue
- event
- issue
- decision
- approval request
- goal update
- observation

## Idempotency

A report ingestion request should have a client or server idempotency key. Replaying the same request must not duplicate material records.

## Ambiguity

Agba should not invent missing dates, amounts, owners, or causality. It may infer a likely date from an explicit reporting period, but the stored record should retain provenance and confidence.

## Evidence

Every normalized record created from a report should be traceable to the originating report. Agba's later observations and decisions should be linked back to their supporting records.

## Daily reporting

V1 should support a daily report cadence, but the database should not require exactly one report per department per day. Multiple reports and corrections are legitimate.

## Corrections

A later report can correct an earlier fact. Corrections should preserve the original evidence and create an auditable update rather than silently rewriting history.