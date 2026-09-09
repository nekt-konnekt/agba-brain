# AGBA ARCHITECTURE

**Status:** Governing technical architecture contract  
**Version:** 1.0  
**Date:** 2026-09-09  
**Applies to:** Agba V1

## 1. Architectural rule

> **One brain, many interfaces.**

Agba's intelligence must not be duplicated inside Telegram, the web application, Agba Office, or individual integrations.

```text
                         AGBA
                 AI EXECUTIVE DIRECTOR
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          OBSERVE        THINK           ACT
             │             │             │
       channels +       memory +       tools +
       integrations     reasoning      workflows
             │             │             │
             └─────────────┼─────────────┘
                           │
                       AGBA BRAIN
                           │
                    AGBA OFFICE / UI
```

## 2. Logical layers

### Layer 1 — Interfaces and gateways

Examples: Telegram, web application, Agba Office, email and future integrations.

Responsibilities:

- receive user/system input;
- authenticate channel-specific inbound events;
- present responses and status;
- never become the source of truth for business state;
- never implement independent copies of core reasoning or authorization.

### Layer 2 — Identity and authorization

Responsibilities:

- authenticate users and services;
- resolve company, role, department and permitted scope;
- enforce policy before retrieval and model context assembly;
- provide the authoritative answer to "may this actor access this record?".

The model is never an authorization boundary.

### Layer 3 — Durable event ingestion

Responsibilities:

- accept inbound events;
- validate and normalize envelope metadata;
- assign or preserve stable idempotency keys;
- persist the raw event before asynchronous processing;
- acknowledge external channels quickly;
- make retries safe.

### Layer 4 — Business memory

PostgreSQL/Supabase stores governed company state and evidence.

Core concepts include, where applicable:

- companies and departments;
- users, roles and scope;
- reports and report evidence;
- facts and observations;
- tasks and commitments;
- issues and risks;
- revenue and expense records;
- goals;
- decisions and approvals;
- conversations and queries;
- actions and action history;
- inbound events;
- audit/provenance records.

Memory is structured. Raw source material is retained where required for traceability and reprocessing.

### Layer 5 — Context and reasoning

Responsibilities:

- classify incoming material;
- retrieve only authorized context;
- assemble relevant evidence;
- reason over the supplied context;
- distinguish facts, inferences, uncertainty and recommendations;
- produce grounded answers, observations, briefings and proposed actions.

The model interprets and reasons. It does not invent authority, mutate protected state directly, or bypass deterministic policy.

### Layer 6 — Action engine

Responsibilities:

- validate requested actions;
- apply deterministic action policies;
- require approval for consequential V1 actions;
- execute through approved tools/integrations;
- persist action state and history;
- make retries idempotent;
- report success, failure, or pending approval.

### Layer 7 — Executive experience

Agba Office consumes the same governed application/data layers as other interfaces.

It should expose:

- current company state;
- exceptions and risks;
- priorities and commitments;
- decisions;
- relevant financial/operational signals;
- actions and approvals;
- recent changes;
- evidence and explanations.

It is not a separate intelligence system.

## 3. Technology baseline

The current baseline is:

- **PostgreSQL / Supabase** for durable data and database authorization;
- **Supabase Auth** for identity;
- **Supabase Edge Functions** for server-side application services and gateways where appropriate;
- **TypeScript** for application code;
- **GitHub** as source control;
- **Vercel / Next.js** for the web application where applicable;
- pluggable AI providers behind application-level interfaces.

Technology may evolve. The logical boundaries in this document are more important than any vendor.

## 4. Request and event flows

### Inbound channel event

```text
External channel
      │
      ▼
Authenticate / validate
      │
      ▼
Persist raw inbound event
      │
      ▼
ACK quickly
      │
      ▼
Asynchronous processing
      │
      ├── resolve identity + scope
      ├── classify
      ├── retrieve authorized context
      ├── normalize / reason
      ├── persist durable outcomes
      ├── create or update actions
      └── deliver response
                │
                ▼
        completed / retry / dead-letter
```

The gateway must not wait for successful AI reasoning before acknowledging a channel that supports asynchronous acknowledgement.

### User question

```text
Question
  │
  ▼
Identity + authorization
  │
  ▼
Authorized retrieval
  │
  ▼
Context assembly
  │
  ▼
Reasoning
  │
  ▼
Answer + evidence + uncertainty
```

### Report

```text
Natural language report
  │
  ▼
Identity + scope
  │
  ▼
Classification / extraction
  │
  ▼
Structured records + preserved evidence
  │
  ▼
Observation / state update
  │
  ▼
Briefing / notification / action candidate
```

### Action

```text
Request
  │
  ▼
Policy + authorization
  │
  ├── prohibited → reject with reason
  ├── approval required → pending approval
  └── permitted → execute
                       │
                       ▼
                  persist outcome
                       │
                       ▼
                    audit
```

## 5. Source-of-truth rules

1. PostgreSQL is authoritative for durable business state.
2. Authorization state is authoritative in database/application policy, not model output.
3. Confirmed source reports are evidence according to the applicable confirmation policy.
4. `agba_actions` and action history are authoritative for action lifecycle state.
5. A proposed action is not a completed action.
6. An executed action is not proof that the intended real-world outcome occurred.
7. An unconfirmed claim must not be presented as established fact.
8. A newer authoritative state supersedes stale derived summaries.
9. Raw source events should be preserved where required for audit and reprocessing.
10. UI state and model context are derived representations, not durable sources of truth.

## 6. Authorization and data boundaries

Authorization must happen before retrieval reaches the model.

```text
User
 │
 ▼
Identity
 │
 ▼
Role + company + department scope
 │
 ▼
Database/application policy
 │
 ▼
Authorized records
 │
 ▼
Context assembly
 │
 ▼
Model
```

A Department Head's default scope is their department. A CEO can access company-wide intelligence according to policy.

The system must not rely on prompts such as "only answer with department data" as the primary security control.

## 7. Model boundary

The model may:

- classify;
- extract candidate facts;
- summarize evidence;
- identify patterns;
- reason about authorized context;
- propose priorities;
- draft actions;
- explain conclusions;
- state uncertainty.

The model may not:

- grant access;
- invent records;
- silently change authoritative business state;
- declare an action completed without an authoritative outcome;
- bypass approval policy;
- use unauthorized records merely because they were retrieved elsewhere;
- override deterministic safety or authorization rules.

## 8. Reliability and idempotency

Every externally delivered event that can be retried must have a stable idempotency key or equivalent deduplication mechanism.

Processing must be safe to repeat. A retry must not create duplicate tasks, duplicate actions, duplicate notifications, or duplicate financial records when the original operation already succeeded.

Failures must preserve:

- original event/input;
- processing status;
- failure reason;
- retry metadata;
- relevant correlation/idempotency identifiers.

A recoverable failure should not require the user to resend the original business event.

## 9. Observability

Critical flows must be observable end-to-end.

At minimum, logs/telemetry should allow us to trace:

```text
inbound event
 → authentication
 → persistence
 → processing
 → model/tool invocation
 → durable outcome
 → outbound delivery
```

Where practical, use correlation IDs so one user event can be followed through the system without exposing sensitive content in logs.

Production monitoring must distinguish at least:

- received;
- accepted;
- processing;
- completed;
- retried;
- failed;
- dead-lettered;
- delivered.

## 10. Security rules

- Secrets remain server-side.
- Webhooks must use provider-supported authentication/signature mechanisms.
- Database authorization uses RLS where applicable plus application policy.
- Service-role credentials are never exposed to the browser.
- Only authorized records enter model context.
- Important state changes are auditable.
- Logs should minimize sensitive business content.
- External tool credentials are isolated per integration/company as appropriate.
- Destructive or consequential operations require explicit policy and, in V1, human approval.

## 11. Database rules

- Agba-owned tables use the `agba_` namespace where required by the existing project convention.
- Schema changes are migration-first and versioned.
- RLS is treated as production security, not an optional hardening step.
- Foreign keys and constraints should express real invariants where practical.
- Application code must not assume a UI has already enforced an invariant.
- Derived data may be cached, but authoritative state must remain recoverable from durable records.

## 12. Integration rules

An integration is an adapter, not a new Agba brain.

Each integration should define:

- inbound event format;
- authentication;
- idempotency strategy;
- mapping into Agba concepts;
- outbound capabilities;
- permission model;
- retry behavior;
- failure/dead-letter behavior;
- audit requirements.

Adding a new channel should not require rewriting core reasoning.

## 13. Web / Agba Office rules

The web experience must consume governed application services and database state.

The UI must not:

- make authorization decisions that the server does not enforce;
- contain secret credentials;
- become a second business-logic implementation;
- display inferred state as authoritative state without qualification.

The Office should be optimized for executive comprehension rather than feature density.

## 14. Change rules

Before a meaningful architectural change is implemented, answer:

1. What user or reliability problem does this solve?
2. Which architectural layer owns it?
3. What is the source of truth?
4. What is the authorization boundary?
5. What happens on retry or partial failure?
6. How is it observed in production?
7. How is it tested?
8. Does it preserve the one-brain principle?
9. Does it conflict with the North Star or launch gates?

If the answer is unclear, the change is not ready for implementation.

## 15. Architecture anti-patterns

Do not introduce:

- channel-specific copies of business reasoning;
- model-controlled authorization;
- synchronous webhook-to-LLM dependencies when asynchronous processing is possible;
- hidden writes from read/query flows;
- UI-only state that pretends to be company state;
- duplicate sources of truth;
- untracked background automation;
- irreversible autonomous actions without explicit policy;
- speculative microservices without an operational need.

## 16. Definition of architectural done

A change is architecturally done when it is placed in the correct layer, has an explicit source of truth, preserves authorization, survives retries, exposes useful telemetry, has tests for important success/failure paths, and does not create a second Agba brain.