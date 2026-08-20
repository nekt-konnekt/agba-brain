# 04 Architecture

## Product boundary

Agba is the operating brain. Interfaces are adapters around the brain, not the brain itself.

Current interface:

```text
Telegram
   |
   v
Telegram Gateway
   |
   v
Agba application services
   |
   +--> Business memory
   +--> Agba reasoning
   +--> Action engine
   +--> Audit / provenance
   |
   v
PostgreSQL / Supabase
```

Future interfaces, including the web application and Agba's Office, use the same application and data layers.

## Logical architecture

```text
CEO / Department Head
        |
        v
Interface / Gateway
        |
        +--> Identity / Authorization
        |
        +--> Durable event ingestion
        |
        +--> Report ingestion
        |
        +--> Retrieval / Context assembly
        |
        +--> Agba reasoning
        |
        +--> Action engine
        |
        +--> Briefing generation
        |
        v
PostgreSQL / Supabase
        |
        +--> Company structure
        +--> Users / roles / scope
        +--> Operational records
        +--> Reports + evidence
        +--> State / observations
        +--> Actions + action history
        +--> Conversations / queries
        +--> Inbound events
        +--> Audit log
```

## Technology baseline

- PostgreSQL through Supabase
- Supabase Auth for identity
- Row Level Security for database authorization
- Supabase Edge Functions for application services and gateways
- TypeScript for application code
- GitHub as the source repository
- Pluggable AI providers for extraction and reasoning

## Separation of concerns

### Database

Stores durable company state and enforces access boundaries.

### Gateway

Authenticates inbound channel events, persists them durably, acknowledges the channel quickly, and hands processing to application services.

### Application service

Owns workflows, validation, normalization, retrieval orchestration, model calls, action policies, retries, and persistence of durable outcomes.

### Model

Interprets language and reasons over already-authorized context. It is not a policy engine and cannot override database state.

## Reliability boundary

The inbound gateway must not depend on successful AI reasoning before acknowledging the channel.

Target flow:

```text
Inbound message
      |
      v
Authenticate
      |
      v
Persist inbound event
      |
      v
ACK channel quickly
      |
      v
Process asynchronously
      |
      +--> retrieve authorized context
      +--> reason / normalize
      +--> persist result
      +--> persist actions
      +--> send response
      |
      v
Completed / retry / dead-letter
```

This prevents a slow model, provider outage, database latency, or temporary application failure from causing Telegram webhook failures or silent message loss.

## Data flow

```text
raw user input
  |
  v
identity + scope
  |
  v
classification
  |
  +--> report -> normalize -> persist evidence
  |
  +--> question -> authorized retrieval -> context assembly -> reasoning
  |
  +--> action command -> deterministic action resolver -> state change
  |
  v
response + evidence + provenance
  |
  v
durable outcome
```

## Source-of-truth rules

1. PostgreSQL is authoritative for business state.
2. Confirmed reports are authoritative evidence according to the confirmation policy.
3. Action status is authoritative in `agba_actions` and its history.
4. The model may propose a state transition but cannot fabricate one.
5. A completed action must not appear open because an older prompt or state item says it was open.
6. An action is not evidence that the intended real-world outcome occurred.
7. A report claiming an outcome is evidence only after it passes the applicable confirmation policy.

## Idempotency and recovery

Every externally delivered event that can be retried must have a stable idempotency key. Processing must be safe to repeat.

Failed processing must preserve the original input and failure state so it can be retried or inspected without asking the user to resend the original business event.

## Security requirements

- Authorization is enforced by PostgreSQL RLS and application services.
- The model never decides whether a user is allowed to see a record.
- Only authorized records enter model context.
- Secrets remain server-side.
- Telegram webhook requests must be authenticated with a secret token.
- Important state changes require an audit trail.
