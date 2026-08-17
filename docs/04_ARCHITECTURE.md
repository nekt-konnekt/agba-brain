# 04 Architecture

## Logical architecture

```text
CEO / Department Head
        │
        ▼
 Conversation + Reporting API
        │
        ├── Identity / Authorization
        │
        ├── Report ingestion
        │
        ├── Normalization
        │
        ├── Retrieval / Context assembly
        │
        ├── Agba reasoning
        │
        └── Briefing generation
        │
        ▼
 PostgreSQL / Supabase
        │
        ├── Company structure
        ├── Operational records
        ├── Reports + evidence
        ├── Memory / observations
        ├── Conversations
        └── Audit log
```

## Technology baseline

- PostgreSQL through Supabase
- Supabase Auth for identity
- Row Level Security for database authorization
- Application service for orchestration
- OpenAI models for extraction, reasoning, and briefing generation
- TypeScript for application code
- GitHub as the source repository

## Separation of concerns

### Database

Stores durable company state and enforces access boundaries.

### Application service

Owns workflows, validation, normalization, retrieval orchestration, model calls, and action policies.

### Model

Interprets language and reasons over already-authorized context. It is not a policy engine.

## Data flow

```text
raw user input
  ↓
identity + scope
  ↓
report/question classification
  ↓
authorized retrieval
  ↓
structured extraction / context assembly
  ↓
reasoning
  ↓
response + evidence
  ↓
persist durable outcomes
```

## Reliability requirements

- Idempotent report ingestion where a client request can be retried.
- Audit important state changes.
- Preserve raw report text.
- Store source references for derived records.
- Keep model prompts and permissions separate from user-provided text.
- Never send records outside the user's authorized scope into the model context.