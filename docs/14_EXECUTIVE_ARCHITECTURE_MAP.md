# 14 Executive Architecture Map

## Objective

This document maps the current Agba implementation to Executive Architecture V2 so migration can happen without a destructive rewrite.

## Current to target mapping

| Current capability | Primary target layer | Role after migration |
|---|---|---|
| `telegram-receiver` | Observe | Receive and authenticate Telegram events, persist durable inbound signal |
| `telegram-gateway` | Observe | Channel gateway and identity/scope resolution |
| `report-ingestion` | Observe + Memory | Normalize staff/CEO reports into governed evidence |
| `company-state` / `company-state-v2` | Memory | Read and materialize current company state |
| `executive-memory` | Memory | Durable executive context and historical memory |
| `agba-evidence-provenance` data | Memory | Evidence lineage for conclusions |
| `agba-reasoning` | Think | Generate structured observations, issues, risks, opportunities, recommendations |
| `ceo-query` | Think + interface adapter | Assemble authorized context and request executive reasoning; should converge on Executive Core |
| `daily-briefing` / `daily-briefing-v2` | Think + interface output | Render executive-loop state for management; should not own independent business reasoning |
| `proactive-runner` | Decide + loop scheduler | Detect conditions requiring renewed executive evaluation |
| `proposal-router` | Decide | Route proposed work through policy and authorization |
| `proposal-executor` | Act | Execute approved proposals and persist result |
| `action-router` | Decide + Act | Resolve action intent and dispatch to execution |
| `action-dispatch` | Act | Execute internal action commands |
| `workforce-action-router` | Act | Route authorized workforce actions |
| `telegram-delivery-worker` | Act | Deliver outbound Telegram actions asynchronously |
| `telegram-worker` | Observe/Act worker | Process Telegram jobs; ownership should be narrowed to source-specific processing |
| `telegram-invite` | Identity/Observe | Onboard and bind staff identities to company scope |
| `office-read` | Interface adapter | Read executive state for Agba's Office |
| `office-command` | Interface adapter + Act | Translate Office commands into governed actions |
| `agba-mcp` | Connector boundary | Expose approved capabilities to external systems without owning business truth |
| `intelligence-worker` | Think/loop worker | Background executive intelligence processing |

## Target ownership

### Observe owns

- inbound channel authentication;
- source normalization;
- durable event persistence;
- idempotency;
- source provenance;
- company and actor resolution.

### Memory owns

- durable company facts;
- current state;
- observations and evidence;
- issues and historical state;
- decisions and action history;
- relationships and provenance.

### Think owns

- context assembly;
- temporal comparison;
- pattern detection;
- risk/opportunity analysis;
- confidence;
- structured recommendations.

### Decide owns

- materiality;
- urgency;
- management attention thresholds;
- authorization checks;
- choose `NO_ACTION`, `MONITOR`, `ASK`, `RECOMMEND`, `ESCALATE`, or `ACT`;
- create/update durable decision records.

### Act owns

- action execution;
- connector calls;
- retries;
- execution records;
- result capture;
- verification hooks.

### Executive Loop owns

- triggering executive evaluation;
- coordinating Observe -> Memory -> Think -> Decide -> Act -> Outcome;
- re-entering the loop when new evidence or outcomes arrive;
- ensuring Morning Brief, proactive alerts, CEO queries, and operational responses use the same core state.

## Current architectural risks

### 1. Reasoning fragmentation

Multiple services currently perform adjacent reasoning or orchestration. This risks producing different answers depending on whether a signal arrived through Telegram, a CEO query, a briefing job, or a proactive worker.

**Target:** one Executive Core with adapters around it.

### 2. State-model duplication

The presence of multiple company-state and briefing generations indicates evolutionary layering.

**Target:** one canonical company state and one canonical executive context contract, while retaining compatibility wrappers during migration.

### 3. Action-boundary ambiguity

Routing, proposals, dispatch, workforce actions, and delivery are separate services.

**Target:** Decision creates an authorized action intent; Act executes it; Outcome verifies it. Channel delivery remains an execution adapter.

### 4. Telegram worker overlap

Telegram gateway, receiver, worker, and delivery worker must have sharply separated responsibilities.

**Target:** inbound Observe, asynchronous processing, and outbound Act should be independently retryable.

### 5. Briefing as a parallel brain

Daily briefing must not independently decide what matters.

**Target:** briefing renders already-evaluated executive state from the common loop.

## Migration sequence

### Step 1: Contract first

Introduce canonical TypeScript/domain contracts for:

- `Observation`
- `Evidence`
- `BusinessContext`
- `ReasoningResult`
- `Decision`
- `ActionIntent`
- `ActionExecution`
- `Outcome`

No behavior change is required in this step.

### Step 2: Normalize inbound observations

Move Telegram reporting and future connectors toward the same Observation contract.

Do not make Telegram-specific payload shapes part of the executive core.

### Step 3: Centralize context assembly

Create one authorized context assembler. CEO query, proactive evaluation, and briefing generation should consume the same context contract.

### Step 4: Centralize Think/Decide

Create an Executive Core entry point that returns structured reasoning and a decision recommendation. Existing functions can call it during migration.

### Step 5: Centralize action intent

All action-producing features should create the same ActionIntent structure before dispatch.

### Step 6: Close the loop

Execution results and verified outcomes must feed back into Memory and trigger re-evaluation when material.

### Step 7: Retire duplicated orchestration

Only after production E2E tests prove equivalence should legacy duplicated reasoning/orchestration be removed.

## Definition of architectural completion

Agba is on V2 when:

1. every inbound signal enters through an Observation contract;
2. company context is assembled by one governed memory/context layer;
3. executive reasoning has one canonical Think/Decide contract;
4. all actions pass through a common authorization and action-intent boundary;
5. outcomes feed Memory;
6. Telegram, web, briefing, and proactive systems are adapters around the same Executive Core;
7. connectors can be added without creating new business reasoning paths;
8. the CEO sees a coherent executive picture regardless of where the underlying information originated.
