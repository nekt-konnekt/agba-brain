# 13 Executive Architecture V2

## Purpose

Agba is an AI Executive Director for a company.

The architecture is organized around a continuous executive loop, not around individual interfaces or AI features.

```text
                         AGBA
                 AI EXECUTIVE DIRECTOR
                            |
          +-----------------+-----------------+
          |                 |                 |
       OBSERVE             THINK              ACT
          |                 |                 |
          v                 v                 v
      Telegram          Business          Telegram
      Email             Memory            Email
      Calendar          Context           Calendar
      CRM               Reasoning         CRM
      Documents         Analysis          Other tools
      Other MCP         Decisions
          |                 |
          +-----------------+-----------------+
                            v
                    EXECUTIVE LOOP
                            |
                            v
                    CEO / MANAGEMENT
```

The diagram is a product architecture, not a literal request pipeline. Agba continuously observes the business, updates memory, reasons over current and historical context, decides whether attention or action is warranted, acts within authorization, observes the outcome, and continues the loop.

## Core principle

Agba's product identity is the Executive Director. Connectors, interfaces, MCP servers, models, and background workers are implementation capabilities.

Do not allow a connector, interface, or model to become the business brain.

## Executive loop

```text
OBSERVE
  -> normalize signal
  -> establish identity and company scope
  -> persist durable observation

MEMORY
  -> update facts and state
  -> preserve history
  -> connect related entities and events
  -> retain evidence and provenance

THINK
  -> assemble authorized context
  -> compare current state with history and goals
  -> identify patterns, risks, opportunities, contradictions, and missing information

DECIDE
  -> determine whether to ignore, monitor, ask, recommend, escalate, or act
  -> apply authorization and policy
  -> create a durable decision/recommendation record where appropriate

ACT
  -> execute approved internal or external actions
  -> record intent, execution, result, and failure

OUTCOME
  -> verify what actually happened
  -> update memory
  -> reopen or close issues according to evidence
  -> continue monitoring
```

## Layer contracts

### 1. Observe

Observe is responsible for acquiring business signals.

Sources include Telegram, email, calendar, CRM, documents, accounting, inventory, and other MCP-connected systems.

Observe must:

- authenticate the source;
- resolve company and actor scope;
- normalize source-specific payloads;
- persist the original event or evidence;
- assign a stable idempotency key;
- acknowledge inbound channels without waiting for model reasoning.

Observe must not decide what the business should do.

### 2. Business Memory

Memory is the durable representation of the company Agba is responsible for understanding.

Memory contains, at minimum:

- company facts;
- operational state;
- people, roles, and departments;
- observations;
- issues;
- decisions;
- actions and outcomes;
- evidence and provenance;
- relevant historical context.

Memory is not a chat transcript store. A message is an input; business memory is the structured, governed knowledge derived from authorized evidence.

Historical records remain immutable unless a correction is explicitly recorded.

### 3. Think

Think converts authorized business memory into structured understanding.

It produces explicit objects such as:

- observations;
- trends;
- issues;
- risks;
- opportunities;
- hypotheses;
- missing-information requests;
- recommendations.

Every material inference must identify its supporting evidence and confidence.

The model is an interpreter and reasoning component. It is not the authorization or source-of-truth layer.

### 4. Decide

Decide is the policy and executive judgment boundary between understanding and execution.

For every material situation Agba should be able to choose among:

```text
NO ACTION
MONITOR
ASK
RECOMMEND
ESCALATE
ACT
```

The decision must consider:

- materiality;
- urgency;
- confidence;
- business impact;
- current company state;
- existing decisions;
- action ownership;
- authorization;
- whether additional information is required.

A model-generated recommendation is not automatically an organizational decision.

### 5. Act

Act executes authorized work through internal Agba actions or external tools.

Every action has:

```text
intent
-> authorization
-> execution
-> result
-> verification
-> outcome
```

Execution status and real-world outcome are separate states. Sending an email, for example, proves delivery to the email provider, not that the recipient accepted the proposed change.

### 6. Outcome

Outcome closes the loop.

Agba must distinguish:

- action requested;
- action executed;
- action failed;
- result observed;
- business outcome confirmed.

Outcome evidence feeds Memory and can change the next executive decision.

## Interfaces

Web, Telegram, email, and future interfaces are adapters into the same executive system.

An interface may:

- present executive state;
- accept a CEO or staff input;
- display recommendations and actions;
- request clarification;
- expose evidence and provenance.

An interface must not maintain an independent version of company truth.

## Connectors and MCP

Connectors are senses and hands.

```text
SENSES
Telegram / Email / Calendar / CRM / Documents / MCP
        |
        v
OBSERVE
        |
        v
AGBA EXECUTIVE CORE
        |
        v
ACT
        |
        v
Telegram / Email / Calendar / CRM / Other tools
```

Adding a connector must not require a new reasoning architecture. It should implement the source/action contracts and feed the common executive loop.

## Canonical object flow

The target object relationships are:

```text
External Event
      |
      v
Observation
      |
      +------> Fact / State update
      |
      v
Context
      |
      v
Reasoning
      |
      +------> Issue / Risk / Opportunity
      |
      v
Decision
      |
      +------> Recommendation
      |
      v
Action
      |
      v
Execution
      |
      v
Outcome
      |
      +------> Memory update
      |
      +------> New observation
```

## Executive attention

Agba must optimize for management attention, not volume of notifications.

Routine operational work should remain with its owner unless it becomes material to company performance, risk, timing, cash, customers, or another defined management threshold.

The Morning Brief is therefore an output of the executive loop, not a separate intelligence system.

The same executive reasoning should power:

- Morning Brief;
- Telegram executive conversations;
- web executive cockpit;
- proactive alerts;
- action recommendations;
- issue escalation.

## Migration rule

The existing Agba system should be refactored incrementally.

Do not rewrite working production paths merely to rename them.

Each existing service should be assigned to one primary architectural responsibility. During migration, compatibility adapters may preserve existing APIs while the underlying ownership moves to the new layer.

The migration is complete when no core feature contains its own independent business reasoning, memory model, or decision policy outside the Executive Core.

## Non-negotiable boundaries

1. PostgreSQL remains authoritative for durable business state.
2. Authorization is enforced outside the model.
3. Only authorized context enters reasoning.
4. Models cannot fabricate company facts or silently create organizational decisions.
5. Connectors cannot bypass Memory, Decision, or Action policy.
6. External actions require explicit authorization or a narrowly scoped automation policy.
7. Every material conclusion has evidence/provenance.
8. Every retryable inbound event is idempotent.
9. Every external action has an execution record and outcome state.
10. Every material outcome can update company memory.
