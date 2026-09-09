# AGBA DECISIONS

**Status:** Architecture and product decision record  
**Version:** 1.0  
**Date:** 2026-09-09

This file records decisions that materially affect Agba's product boundary, architecture, security, reliability, or operating model.

A decision is not a task list. Tasks belong in issues/roadmaps. This document records **what we decided, why, and what follows from it**.

## Decision rules

1. Decisions should be written before or immediately after a significant architectural change.
2. A new decision that changes an existing one must explicitly supersede it.
3. Existing decisions remain valid until superseded.
4. Product and architecture documents are normative; this record explains the reasoning behind them.
5. If a decision introduces migration or operational risk, record that risk here.

---

## ADR-001 — Agba is the operating brain

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Agba is an AI Executive Director / operating brain. Interfaces such as Telegram and Agba Office are adapters around the brain, not independent products with independent reasoning.

**Why**

The product must develop a coherent understanding of the company rather than fragmenting intelligence across channels and screens.

**Consequence**

Core reasoning, memory, authorization, and action orchestration belong in shared application services and durable data layers.

---

## ADR-002 — One brain, many interfaces

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Telegram, email, web, Agba Office, calendar, CRM, and future integrations are channels, interfaces, or tools. They must not become separate Agba brains.

**Why**

A new channel should extend reach, not fork product logic.

**Consequence**

Integration adapters translate external events into Agba concepts and consume shared application services.

---

## ADR-003 — Agba Office is the executive cockpit

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Agba Office is the CEO's executive cockpit, not a generic analytics dashboard.

**Why**

The value proposition is executive understanding and action, not metric density.

**Consequence**

Office priorities are company state, changes, exceptions, risks, decisions, actions, and attention—not decorative dashboards.

---

## ADR-004 — Conversation and natural language are first-class

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Natural-language reporting and questioning are first-class V1 interactions.

**Why**

The lowest-friction way for an executive or department head to communicate business context is often ordinary language rather than structured forms.

**Consequence**

The system must preserve source language where useful while also extracting governed structured records.

---

## ADR-005 — PostgreSQL/Supabase is durable business state

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

PostgreSQL through Supabase is authoritative for durable company state, subject to the application's source-of-truth rules.

**Why**

Business intelligence needs durable, queryable, constrained state and explicit authorization boundaries.

**Consequence**

UI state, model context, cached summaries, and prompts are derived representations and cannot silently become authoritative state.

---

## ADR-006 — Authorization happens before reasoning

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Authorization is resolved before records are retrieved into model context. PostgreSQL RLS and application policy are the security boundary.

**Why**

A model cannot safely enforce tenant, role, or department access merely through instructions.

**Consequence**

Unauthorized data must be excluded before model invocation. Model output cannot grant itself access.

---

## ADR-007 — Department Heads are department-scoped by default

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Department Heads default to their own department scope. Company-wide context is available only where policy explicitly permits it.

**Why**

The product needs useful departmental intelligence without creating accidental company-wide disclosure.

**Consequence**

Scope must be represented and enforced in durable authorization policy, not only in UI filters or prompts.

---

## ADR-008 — Preserve raw source evidence

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Important inbound reports/events retain their source evidence where required for auditability and reprocessing.

**Why**

Agba's conclusions must be challengeable and traceable.

**Consequence**

Derived facts and observations should retain provenance to their source where practical.

---

## ADR-009 — Structured memory over transcript-only memory

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Company memory is represented through structured concepts such as facts, observations, issues, decisions, goals, tasks, relationships, actions, and evidence, rather than relying on chat history alone.

**Why**

Longitudinal business intelligence requires state that can be queried, compared, authorized, and audited.

**Consequence**

The model may help extract or summarize memory, but durable memory lives in governed application/database structures.

---

## ADR-010 — Human approval for consequential V1 actions

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Consequential business actions require human approval in V1 unless explicitly classified as safe, deterministic, and permitted by policy.

**Why**

We want useful execution without premature autonomous authority.

**Consequence**

Action lifecycle and approval state must be durable and auditable. A recommendation is never presented as an executed outcome.

---

## ADR-011 — Durable event ingestion before asynchronous processing

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Retryable inbound events are persisted before asynchronous reasoning/processing and, where supported, acknowledged quickly.

**Why**

A slow model, temporary provider outage, or application error must not cause message loss or repeated webhook failures.

**Consequence**

Workers/processors must be designed for retries, idempotency, and dead-letter recovery.

---

## ADR-012 — Idempotency is a first-class reliability primitive

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Externally delivered events and retryable actions must have stable idempotency/deduplication semantics.

**Why**

At-least-once delivery and retries are normal production conditions.

**Consequence**

Repeated delivery must not duplicate durable business outcomes.

---

## ADR-013 — `agba_` database namespace

**Status:** Accepted  
**Date:** Existing project convention; reaffirmed 2026-09-09

**Decision**

Agba-owned physical tables use the `agba_` namespace where required by the existing Supabase project convention.

**Why**

The existing Supabase project contains unrelated public tables and Agba needs a clear namespace boundary.

**Consequence**

New Agba migrations should preserve this convention unless a deliberate migration decision supersedes it.

---

## ADR-014 — Repository source of truth is readable source

**Status:** Accepted  
**Date:** Existing decision; reaffirmed 2026-09-09

**Decision**

Readable Markdown, SQL, TypeScript, configuration, and tests are the engineering source of truth. Historical ZIP artifacts are not treated as the active implementation.

**Why**

The system must be inspectable, reviewable, and maintainable.

**Consequence**

Changes should land in source-controlled files rather than relying on opaque uploaded artifacts.

---

## ADR-015 — No feature expansion during launch hardening

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Once the core V1 surface is established, engineering priority shifts from feature expansion to launch gates: identity, connectivity, intelligence, actions, Office, reliability, security, and pilot validation.

**Why**

The current risk is not simply missing features. The greater risk is having individually built pieces that do not form one reliable executive product.

**Consequence**

P0 launch blockers take priority over P2/P3 feature work. Any scope expansion requires an explicit decision.

---

## ADR-016 — No second Agba brain

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

No channel, UI, worker, integration, or future service may independently reproduce core Agba reasoning or maintain a conflicting source of truth.

**Why**

Duplicated intelligence produces inconsistent answers, security gaps, and unmaintainable behavior.

**Consequence**

If a new capability needs reasoning, it must use the shared Agba application/reasoning layer or a clearly defined extension point.

---

## ADR-017 — Launch is a demonstrated system property

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

Agba is considered launched only when the defined launch gates pass and the core loop can be demonstrated live end-to-end.

**Why**

A successful deployment or polished interface is not evidence that the operating brain works reliably.

**Consequence**

The final launch test must show signal → ingestion → memory → reasoning → executive visibility → controlled action → recorded outcome → remembered outcome.

---

## ADR-018 — Governance documents are part of the product system

**Status:** Accepted  
**Date:** 2026-09-09

**Decision**

`AGBA-NORTH-STAR.md`, `AGBA-ARCHITECTURE.md`, `AGBA-LAUNCH-GATES.md`, and `DECISIONS.md` are maintained as first-class repository artifacts.

**Why**

Agba should not depend on conversational memory to preserve architectural intent.

**Consequence**

Before significant work, engineers/agents should consult these documents. If reality conflicts with them, the conflict is surfaced and resolved deliberately rather than ignored.

---

# Supersession log

No prior decision is currently superseded by this governance set; these ADRs formalize and consolidate the principles already present in the repository.

If a future decision changes one of these rules, add a new ADR with an explicit `Supersedes: ADR-XXX` field rather than silently editing history.