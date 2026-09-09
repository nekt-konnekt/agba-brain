# AGBA NORTH STAR

**Status:** Governing product charter  
**Version:** 1.0  
**Date:** 2026-09-09  
**Applies to:** Agba V1 and all work derived from it

## 1. The one-sentence definition

> **Agba is an AI Executive Director: the operating brain that observes a business, understands its context and memory, identifies what matters, and helps the right people decide and act.**

Agba is not merely a chatbot, dashboard, reporting form, or automation layer. Those are interfaces or capabilities around the operating brain.

## 2. The problem Agba exists to solve

Business owners and executives should not have to reconstruct the state of their company from scattered conversations, departmental reports, spreadsheets, reminders, and disconnected tools.

Agba exists to reduce that executive burden by continuously turning business activity into governed company memory and useful intelligence.

The desired executive experience is simple:

- **What happened?**
- **What changed?**
- **What matters?**
- **What is at risk?**
- **What needs me?**
- **What should happen next?**
- **What has Agba already done?**

## 3. The Agba operating loop

```text
OBSERVE → UNDERSTAND → DECIDE → ACT → REMEMBER
     ↑                                  │
     └──────────── LEARN / UPDATE ──────┘
```

### Observe

Receive signals from people, conversations, reports, documents, calendars, systems, and approved integrations.

### Understand

Normalize signals into governed company facts, observations, relationships, commitments, issues, decisions, goals, and evidence.

### Decide

Use authorized context and company memory to identify implications, priorities, risks, conflicts, and recommended next actions.

### Act

Prepare, request approval for, or execute permitted actions. Consequential actions remain human-approved in V1.

### Remember

Persist durable outcomes, decisions, evidence, and changes so future reasoning improves instead of restarting from zero.

## 4. Product hierarchy

Agba has one brain and many surfaces.

```text
                         AGBA
                 AI EXECUTIVE DIRECTOR
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          OBSERVE        THINK           ACT
             │             │             │
      Channels /      Memory +        Tools /
      integrations    reasoning       workflows
             │             │             │
             └─────────────┼─────────────┘
                           │
                     AGBA BRAIN
                           │
                     AGBA OFFICE
```

**Agba Brain** is the intelligence and orchestration layer.  
**Agba Office** is the executive control room.  
**Telegram, email, web, calendar, CRM and future integrations** are channels or tools.  
**Supabase/PostgreSQL** is governed infrastructure and durable state, not the product itself.

## 5. Who V1 serves

### CEO

The CEO gets company-wide intelligence: cross-department state, risks, priorities, decisions, financial and operational signals, and Agba's synthesis.

### Department Head

A Department Head gets department-scoped intelligence by default, can submit reports, ask questions, follow up on work, and receive only company context explicitly permitted by policy.

### Agba

Agba is the reasoning and orchestration layer over governed company data. **Agba never grants itself access.** Authorization is determined before information reaches the model.

## 6. The five product promises

Agba must become excellent at five things:

1. **Know** — maintain useful, structured, traceable company memory.
2. **Notice** — detect meaningful changes, exceptions, risks, and commitments.
3. **Explain** — show why an item matters and what evidence supports it.
4. **Recommend** — propose sensible next steps grounded in context.
5. **Act** — turn approved decisions into reliable execution and report the result.

A feature that does not materially strengthen at least one of these promises needs a strong justification before it enters the core product.

## 7. Product principles

These principles are binding, not inspirational copy.

1. **Truth before fluency.** A precise "I don't know" beats a confident invention.
2. **Evidence before inference.** Important claims must be traceable to company evidence or explicit user statements.
3. **Access before reasoning.** Authorization is resolved before context reaches the model.
4. **Memory is structured.** Facts, observations, issues, decisions, goals, relationships, and evidence are distinct concepts.
5. **Ownership matters.** Operational information should have an owner/source where practical.
6. **CEO sees the company.** Cross-department intelligence is intentional.
7. **Department Heads see their lane.** Department scope is the safe default.
8. **Natural language is first-class.** Reporting and questioning should feel conversational.
9. **No dashboard theatre.** Agba Office exists to expose state, decisions, exceptions, and attention—not decorative analytics.
10. **Human approval for consequential actions.** V1 does not silently execute consequential business actions.
11. **Every conclusion can be challenged.** Users can ask why Agba believes something and inspect evidence.
12. **Small core, extensible architecture.** Build durable primitives before speculative enterprise features.

## 8. Agba Office: the executive experience

The Office is not a BI suite. It is the executive cockpit.

Its primary questions are:

- **Today:** What is happening now?
- **Ask Agba:** What does Agba know and why?
- **Actions:** What is waiting, approved, completed, or failed?
- **Departments:** What needs attention across business areas?
- **Memory:** What does Agba remember and what evidence supports it?

The Office succeeds when a CEO can understand the company's important state quickly without manually assembling it from multiple systems.

## 9. V1 scope

V1 should establish these durable capabilities:

- company and department structure;
- governed identity and roles;
- natural-language reporting;
- durable inbound events;
- structured company memory;
- evidence and provenance;
- observation and exception detection;
- grounded questions and answers;
- daily/periodic executive briefing;
- tasks, issues, expenses, revenue records, decisions, approvals, and goals where supported by the current data model;
- action preparation and human approval;
- reliable delivery through supported channels;
- Agba Office for executive visibility;
- auditability and recovery.

## 10. Explicit non-goals for V1

Agba V1 will not attempt to be:

- an autonomous CFO;
- an autonomous HR decision-maker;
- a replacement accounting system;
- a replacement CRM;
- a replacement departmental workflow suite;
- a generic BI platform;
- an unrestricted company-wide data lake for every employee;
- a fully autonomous agent with authority to make consequential decisions;
- a collection of disconnected AI features.

## 11. The Agba test

Before building a feature, ask:

1. Does it make Agba better at **knowing** the business?
2. Does it make Agba better at **noticing** what matters?
3. Does it make Agba better at **explaining** what matters?
4. Does it make Agba better at **recommending** what should happen?
5. Does it make Agba better at **acting** reliably?
6. Does it improve the executive's ability to understand and control the business?
7. Can it be implemented without weakening authorization, evidence, reliability, or simplicity?

If the answer is no across the board, do not build it in V1.

## 12. Definition of done for product work

A product change is not done because the screen exists or the model responds.

It is done only when:

- the user outcome is clear;
- the correct architectural layer owns the behavior;
- authorization is preserved;
- durable state is correct;
- failures are observable and recoverable;
- important claims remain traceable;
- the happy path and important failure paths are tested;
- existing critical flows remain intact;
- the change is consistent with this North Star and the Architecture contract.

## 13. Change authority

This document governs product direction. If a proposed feature conflicts with it, the feature does not silently override it.

A deliberate change to the product boundary or V1 definition must be recorded in `docs/DECISIONS.md` with the reason, impact, and migration implications.

**North Star:** Agba should increasingly feel less like software the executive operates and more like an Executive Director who already understands the company and knows what deserves attention—while remaining governed, explainable, and under human control.