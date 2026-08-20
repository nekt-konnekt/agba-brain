# Agba Build Roadmap

## Product North Star

Agba is the operating brain of a company. It turns business activity into governed company memory, reasons over that memory, identifies what matters, and helps people execute the right actions.

Telegram is the current V1 interface. It is not the product itself. A web interface, Agba's Office, will sit on the same underlying brain and data model.

## System model

```text
Interfaces
  Telegram / Web / future channels
          |
          v
Gateway + Identity
          |
          v
Business Memory
  reports / facts / state / evidence
          |
          v
Agba Reasoning
          |
          v
Action Engine
  propose -> assign -> execute -> verify -> close
          |
          v
Audit + Learning
```

## Build layers

### 1. Identity and organization

- Organization provisioning
- CEO and Department Head identities
- Department ownership
- Role and scope enforcement
- Authentication

Status: **Substantially built**

### 2. Business memory

- Natural-language reports
- Confirmed reports
- State items
- Evidence and provenance
- Company structure
- Durable operational records

Status: **Built and being hardened**

### 3. Agba reasoning

- Grounded CEO questions
- Context assembly from authorized records
- Confidence and reasoning provenance
- Provider fallback
- No invented business facts

Status: **Built and being hardened**

### 4. Action engine

- Create evidence-backed actions
- Deduplicate actions
- Assign owners
- Track open/in-progress/done state
- Natural-language completion commands
- Action history and auditability
- Execution hooks for future integrations

Status: **Built, current focus is lifecycle hardening**

### 5. Interfaces

- Telegram gateway as V1 interface
- Web authentication and frontend
- Agba's Office executive cockpit
- Future channel adapters

Status: **Telegram built; web frontend not yet built**

### 6. Production reliability

- Fast webhook acknowledgement
- Durable inbound event persistence
- Idempotent processing
- Retry queue
- Failed-event recovery
- Provider retry/fallback
- Health checks
- Observability
- Alerting

Status: **Next major engineering milestone**

## Current milestone

### M1: Reliable Agba operating loop

The core loop is:

```text
CEO input
  -> authenticated gateway
  -> durable business evidence
  -> grounded reasoning
  -> response
  -> action creation/update
  -> durable state
```

Acceptance criteria:

1. A CEO can report a new business fact through Telegram.
2. The fact is stored as a confirmed or pending report according to role and policy.
3. Agba can answer a subsequent question using that persisted evidence.
4. Agba can create an action from a business issue without duplicates.
5. The CEO can inspect, assign, start, and complete an action using natural language.
6. Completed actions never appear as open merely because the model remembers an earlier state.
7. Telegram retries do not duplicate reports, queries, or actions.
8. A temporary webhook or AI provider failure does not silently lose the CEO's message.
9. Every important conclusion has durable provenance.

## Next milestones

### M2: Reliable event processing

Build the Telegram gateway around durable event ingestion rather than synchronous AI work.

Target flow:

```text
Telegram
  -> authenticate
  -> persist inbound event
  -> return success quickly
  -> process asynchronously
  -> persist result
  -> send response
```

Required capabilities:

- Telegram update idempotency
- inbound event table
- processing status
- retry counter
- failure reason
- retry worker
- dead-letter state
- gateway health endpoint
- provider fallback

### M3: Web foundation

Build the first real Agba web application.

Required V1 screens:

- authentication
- company setup/onboarding
- Agba conversation
- current company state
- open actions
- reports/evidence
- basic account/company settings

Do not build a generic analytics dashboard.

### M4: Agba's Office

Create the CEO executive cockpit described in the product contract.

It should answer quickly:

- What is happening?
- What needs me?
- What changed?
- What is at risk?
- What actions are open?

### M5: Operational integrations

Only after the core loop is reliable, add connectors that allow Agba to execute approved actions on external systems.

Examples may include messaging, email, commerce, accounting, inventory, or workflow systems.

External execution must always have explicit authorization, auditability, and an outcome state.

## Build gate

Before adding any feature, answer:

1. Which layer does it belong to?
2. Which milestone does it advance?
3. What database state does it create or change?
4. What is the source of truth?
5. What happens if the request is retried?
6. What happens if the AI provider fails?
7. How do we test it end to end?

If these answers are not clear, the feature is not ready to build.

## Definition of V1

A real company can:

1. configure its organization;
2. authenticate its CEO and Department Heads;
3. submit natural-language business reports;
4. maintain governed company memory;
5. ask grounded questions through Telegram and the web interface;
6. see important business state and evidence;
7. create and manage operational actions;
8. receive a useful daily briefing;
9. use Agba's Office to inspect company state;
10. recover safely from transient infrastructure or model failures.

V1 is not complete until the system is reliable enough to run a real company's daily operating loop without silent data loss or fabricated state.
