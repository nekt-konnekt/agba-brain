# Agba 🧠

Agba is the company's operating brain. It receives structured and natural-language reports from the CEO and department heads, maintains company memory, detects important changes, and gives the right person the right intelligence.

## Product surfaces

- **Web:** authenticated company workspace for company setup, daily briefing, reports, open management actions, and CEO intelligence queries.
- **Telegram:** conversational interface backed by a durable inbox and delivery outbox with lease recovery, retry, dead-letter handling, and idempotency.
- **Supabase:** source of truth for company state, evidence, memory, actions, reports, briefings, and Telegram queue state.
- **AI gateway:** Alibaba/DashScope first, OpenAI fallback, with Puter available where configured. Model output is validated before it becomes Agba state.

## V1 users

- CEO: full company intelligence.
- Department Head: department intelligence plus company context explicitly permitted by policy.
- Agba: reasoning over governed company data. It does not grant access by itself.

## Web app

The repository root contains the production web surface:

```text
index.html
app.js
styles.css
vercel.json
```

The browser uses the Supabase publishable key only. Service-role credentials remain server-side inside Supabase Edge Functions.

The web flow is:

1. Sign in or create an account.
2. First-time CEO completes company setup.
3. Agba loads the authenticated user's company and role.
4. CEO or Department Head submits reports.
5. Agba generates a daily briefing from persisted state, reports, and tasks.
6. CEO can ask Agba questions. Answers are persisted with provenance and management actions.

## Backend

Important Edge Functions include:

- `company-setup`
- `report-ingestion`
- `agba-reasoning`
- `company-state`
- `company-state-v2`
- `daily-briefing`
- `daily-briefing-v2`
- `ceo-query`
- `action-dispatch`
- `telegram-receiver`
- `telegram-worker`
- `telegram-gateway`

## Reliability

CI contains deterministic reliability contracts for:

- action idempotency
- inbox lease protection and recovery
- delivery lease protection and recovery
- retry and max-attempt boundaries
- terminal dead-letter behavior
- Telegram delivery idempotency
- longitudinal memory
- CEO query action memory and incident isolation

Production reconciliation is handled separately from normal application CI. The reconciliation workflow snapshots the live public schema, compares production against the repository migration chain, generates a non-destructive reconciliation migration, and validates a clean local reset before committing the result.

## Security model

Authorization is enforced in PostgreSQL and application services. The model never decides whether a user is allowed to see a record.

The web application never receives service-role credentials. Telegram worker credentials remain inside the Edge Function runtime. Security-definer database functions are being hardened so internal worker RPCs are not publicly callable.

## Production source of truth

GitHub is the source of code and migration history. Supabase production is the runtime source of truth until reconciliation is complete. No destructive remote reset is part of the reconciliation process.
