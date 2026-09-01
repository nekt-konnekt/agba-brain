# Agba Build Status

Last reviewed: 2026-09-01

## Current state

Agba has a working backend operating loop through Telegram. The system is no longer a simple chatbot: it has organization identity, governed reports, company state, grounded CEO queries, persistent management actions, action lifecycle state, and provenance.

The inbound Telegram path is now durable: `telegram-receiver` persists and dedupes every update before any AI processing begins, `telegram-worker` processes the queue with retry and dead-letter handling, and only then dispatches to `action-router` (workforce commands) or `telegram-gateway` (reports, CEO Q&A, reasoning). CEOs can now self-connect their Telegram account directly from their own invitation link, without a separate onboarding step.

## Verified working

### Business evidence

- CEO natural-language reports can be received through Telegram.
- CEO reports are persisted as confirmed company information.
- Subsequent questions can use newly persisted evidence.
- Agba distinguishes confirmed facts from unverified operational intent.

### Reasoning

- CEO questions retrieve company state, confirmed reports, and open actions.
- Responses are grounded in the retrieved company context.
- AI providers have fallback behavior.
- Query provenance records the provider and model used.

### Action engine

- Actions are persisted in `agba_actions`.
- Duplicate open actions are prevented.
- Owners and priorities are stored.
- Open/in-progress/done lifecycle is persisted.
- Natural-language action commands are supported.
- Fabric-allocation lifecycle has been tested end to end.
- Completed actions are excluded from the open-action view.

### Telegram

- Telegram webhook gateway is deployed.
- Webhook authentication is supported through `TELEGRAM_WEBHOOK_SECRET`.
- Telegram typing feedback is supported during synchronous reasoning.
- The gateway can ingest reports and answer CEO questions.

## Known gaps

### Reliability

Durable ingestion (receiver → inbox → worker → dispatch) is built. Still needed before this is called production-hardened: end-to-end verification against the exit criteria below with real Telegram traffic, and observability/alerting on the dead-letter queue.

### Frontend

A static web tree exists (marketing pages, auth pages, onboarding, and an `office.html` shell) served by `server.js`/Vercel. It is not yet wired to live Supabase auth and data — that wiring is the current frontend gap, not the absence of pages.

Telegram is the active interface for the current build.

### Autonomous execution

The action engine currently tracks and manages operational actions. External-system execution is not yet the default production path. Connector-based execution belongs to a later milestone and requires explicit authorization and auditability.

## Current priority

**P0: Make the inbound Telegram event path durable and recoverable.**

Do not expand the feature surface until this is complete.

## Exit criteria for the current priority

- Every Telegram update is persisted before expensive processing begins.
- Telegram receives a fast successful acknowledgement.
- Duplicate updates do not create duplicate business records.
- AI processing can fail without losing the original message.
- Failed processing can be retried.
- Permanent failures are visible in a dead-letter/error state.
- The CEO can see that a request was received even when reasoning is delayed.
- Gateway health can be checked independently of AI health.
- Provider failures are observable and recoverable.

## What comes after reliability

1. Web authentication and frontend foundation.
2. Agba's Office.
3. Daily briefing hardening.
4. Evaluation suite for grounded answers and action safety.
5. External connectors and controlled execution.
