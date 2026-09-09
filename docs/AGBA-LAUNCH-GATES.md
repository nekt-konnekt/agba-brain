# AGBA LAUNCH GATES

**Status:** Production readiness contract  
**Version:** 1.0  
**Date:** 2026-09-09

## Purpose

Agba is not considered launched because the UI looks finished, a deployment is green, or an AI response can be produced.

Agba is launched only when the core system works as one reliable product for a real executive and the critical failure modes are understood and controlled.

## Gate model

```text
G0 GOVERNANCE
      ↓
G1 IDENTITY & ACCESS
      ↓
G2 CONNECTIVITY & INGESTION
      ↓
G3 MEMORY & INTELLIGENCE
      ↓
G4 ACTIONS & CONTROL
      ↓
G5 AGBA OFFICE / EXECUTIVE EXPERIENCE
      ↓
G6 RELIABILITY, SECURITY & OPERATIONS
      ↓
G7 PRODUCTION PILOT
      ↓
      LAUNCH
```

A gate is **PASS** only when its required evidence exists. "Mostly works" is not a pass for a critical path.

---

# G0 — GOVERNANCE

### Objective

Ensure we are building against a stable product and technical contract rather than continuously adding features.

### Must pass

- [ ] `AGBA-NORTH-STAR.md` is the current product authority.
- [ ] `AGBA-ARCHITECTURE.md` is the current technical authority.
- [ ] This launch-gate document is the definition of production readiness.
- [ ] Significant architectural/product decisions are recorded in `DECISIONS.md`.
- [ ] V1 scope is explicitly frozen except for launch blockers or deliberate decision changes.
- [ ] Every open launch blocker has an owner and a severity.

### Blocker rule

No new feature work should displace a P0 launch blocker.

---

# G1 — IDENTITY & ACCESS

### Objective

A real user can enter Agba safely and sees only what their role permits.

### CEO flow

- [ ] Sign up / provisioning works.
- [ ] Sign in works.
- [ ] Session persistence works.
- [ ] Password reset works end-to-end.
- [ ] Invalid credentials fail safely.
- [ ] CEO is assigned the correct company/role.
- [ ] CEO can access company-wide intelligence allowed by policy.

### Department Head flow

- [ ] Department Head can authenticate.
- [ ] Department and role are assigned server-side.
- [ ] Department-scoped records are accessible.
- [ ] Unauthorized departments are inaccessible.
- [ ] Attempts to bypass UI restrictions are rejected server-side.

### Security evidence

- [ ] RLS policies are enabled and tested for critical tables.
- [ ] Service-role credentials are never sent to the browser.
- [ ] Authorization is enforced before model context assembly.
- [ ] There is at least one negative test proving cross-department isolation.

**Gate owner:** Identity/security path  
**Severity:** P0 if broken

---

# G2 — CONNECTIVITY & INGESTION

### Objective

Information reliably enters Agba and cannot silently disappear.

### Telegram / supported channel

For each production channel:

- [ ] Inbound event reaches the gateway.
- [ ] Authentication/signature validation works.
- [ ] Raw event is durably persisted.
- [ ] Duplicate delivery is safely deduplicated.
- [ ] Channel is acknowledged without waiting for a slow model call where applicable.
- [ ] Worker/application processing claims the event.
- [ ] Agba produces a response or durable failure state.
- [ ] Response is delivered back to the correct user/chat.
- [ ] Retry does not duplicate business outcomes.
- [ ] Dead-letter behavior is observable.

### Reporting

- [ ] Natural-language reports can be submitted.
- [ ] Reporter identity and scope are retained.
- [ ] Raw report text is preserved where required.
- [ ] Structured facts/observations can be created from reports.
- [ ] Important evidence remains traceable to the source report.

### Gate evidence

Capture at least one real end-to-end production test:

```text
User message
 → channel
 → gateway
 → durable event
 → worker/application
 → Agba reasoning
 → durable result
 → channel response
```

**Gate owner:** Integration/application reliability  
**Severity:** P0 if the primary channel cannot reliably complete the flow

---

# G3 — MEMORY & INTELLIGENCE

### Objective

Agba demonstrates useful longitudinal intelligence rather than isolated chatbot answers.

### Memory

- [ ] Company structure is known.
- [ ] Department ownership is known.
- [ ] Important reports become durable evidence.
- [ ] Facts/observations are distinguishable from raw claims.
- [ ] Decisions are stored.
- [ ] Goals/commitments/issues/tasks can be represented where supported.
- [ ] Important changes remain queryable later.

### Reasoning

- [ ] Questions retrieve only authorized context.
- [ ] Answers are grounded in company evidence.
- [ ] Important claims can cite or identify supporting evidence.
- [ ] Agba can state uncertainty.
- [ ] Agba does not invent unavailable records.
- [ ] Stale state is not preferred over newer authoritative state.

### Longitudinal test

A test must prove that information introduced in an earlier interaction can be used correctly in a later interaction, without requiring the user to repeat the original context.

### Briefing

- [ ] Daily/periodic briefing can be generated from durable company state.
- [ ] Briefing highlights meaningful changes, risks, priorities, decisions, and attention items rather than generic summaries.
- [ ] Briefing distinguishes evidence from inference.

**Gate owner:** Brain/memory/product intelligence  
**Severity:** P0 if Agba cannot reliably ground its core intelligence

---

# G4 — ACTIONS & CONTROL

### Objective

Agba can turn intelligence into controlled execution without pretending that a recommendation is an outcome.

### Action lifecycle

```text
Proposed → Awaiting approval → Approved → Executing → Completed
                                      ↘ Failed / Retry / Cancelled
```

- [ ] Actions have durable IDs.
- [ ] Action status is authoritative in durable state.
- [ ] Consequential V1 actions require human approval.
- [ ] Approval is attributable to an authorized user.
- [ ] Duplicate execution is prevented.
- [ ] Success/failure is recorded.
- [ ] External execution errors are recoverable.
- [ ] Action history is auditable.
- [ ] Agba does not claim real-world success merely because a command was sent.

### Approval safety

- [ ] The user can distinguish recommendation, pending approval, executed command, and confirmed outcome.
- [ ] Prohibited actions are rejected deterministically.
- [ ] Model output cannot bypass action policy.

**Gate owner:** Action/orchestration  
**Severity:** P0 for unsafe or uncontrolled consequential actions

---

# G5 — AGBA OFFICE / EXECUTIVE EXPERIENCE

### Objective

A CEO can understand the state of the company without manually reconstructing it.

### Today

- [ ] Shows current meaningful company state.
- [ ] Shows what changed.
- [ ] Shows exceptions/risks.
- [ ] Shows priorities/commitments requiring attention.
- [ ] Shows important decisions.
- [ ] Shows action/approval status.
- [ ] Links important intelligence to evidence where applicable.

### Ask Agba

- [ ] Questions work against the same governed intelligence layer.
- [ ] Answers respect the current user's scope.
- [ ] Follow-up questions retain relevant context.
- [ ] The user can challenge an answer and ask why.

### Actions

- [ ] Pending, approved, completed, and failed states are clear.
- [ ] No action appears complete when it is only proposed or attempted.

### Departments

- [ ] CEO can see meaningful cross-department state.
- [ ] Department views respect scope.
- [ ] Empty/healthy departments do not generate meaningless theatre.

### Memory

- [ ] Important company memory can be inspected.
- [ ] Evidence/provenance is understandable.

### Experience test

A fresh CEO session should be able to answer, within a short visit:

1. What happened?
2. What changed?
3. What matters?
4. What needs me?
5. What has Agba already done?

If the interface cannot answer these, it is not finished regardless of visual polish.

**Gate owner:** Product / Office experience  
**Severity:** P0 if the core executive experience is misleading or non-functional

---

# G6 — RELIABILITY, SECURITY & OPERATIONS

### Objective

Agba behaves predictably when things go wrong.

### Reliability

- [ ] Critical database operations have useful constraints.
- [ ] Retries are safe.
- [ ] Idempotency exists for retryable external events/actions.
- [ ] Failed events remain inspectable.
- [ ] Dead-lettered work is visible.
- [ ] No critical webhook depends on synchronous model completion.
- [ ] A provider/model outage does not silently lose inbound business events.

### Observability

- [ ] Critical event flow can be traced end-to-end.
- [ ] Logs identify correlation/idempotency IDs where appropriate.
- [ ] Errors are distinguishable from successful processing.
- [ ] Outbound delivery failures are visible.

### Security

- [ ] Secrets are server-side.
- [ ] Production credentials are not committed.
- [ ] RLS is enabled for protected data.
- [ ] Cross-tenant/company access is blocked.
- [ ] Model context is authorization-filtered.
- [ ] Webhooks are authenticated.
- [ ] Important mutations are audited.

### Recovery

- [ ] Critical data is backed up according to the hosting/database plan.
- [ ] The team knows how to identify a failed event.
- [ ] The team knows how to replay/retry recoverable work.
- [ ] There is a documented rollback path for application deployments.

**Gate owner:** Engineering / operations  
**Severity:** P0 for security, data-loss, or unrecoverable critical-path failures

---

# G7 — PRODUCTION PILOT

### Objective

Prove that the system works for actual business use, not only synthetic tests.

### Pilot requirements

- [ ] A real CEO can authenticate.
- [ ] A real Department Head can authenticate if included in the pilot.
- [ ] Real business reports can enter through the supported channel.
- [ ] Agba can remember and reason over those reports later.
- [ ] Agba Office reflects actual company state.
- [ ] At least one useful briefing is generated from real state.
- [ ] At least one useful action/approval flow is exercised safely.
- [ ] Failures are captured and triaged.
- [ ] No P0 launch blocker remains open.

### Pilot exit criteria

The pilot is successful when the executive can reasonably say:

> "Agba knows what is happening in my company, tells me what matters, can explain why, and helps me move work forward without me having to reconstruct everything myself."

---

# Severity policy

### P0 — Launch blocker

Security breach, data loss, broken authentication, broken primary channel, incorrect authorization, uncontrolled consequential action, or core intelligence that is materially untrustworthy.

**Must be fixed before launch.**

### P1 — Serious product defect

Major workflow failure that does not compromise security or data integrity but materially damages the core product experience.

**Fix before or immediately around pilot; must have explicit CTO acceptance to launch with it.**

### P2 — Important post-launch work

Useful enhancement, moderate UX issue, performance improvement, or secondary workflow gap.

**Does not block launch if the core experience remains sound.**

### P3 — Nice to have

Polish, optional integrations, speculative features, or low-impact improvements.

**Do not allow P3 work to displace P0/P1 work.**

---

# Launch decision rule

Agba may be declared **PRODUCTION LAUNCHED** only when:

- G0 through G6 pass;
- G7 pilot exit criteria pass;
- no P0 blocker remains;
- all known exceptions are recorded in `DECISIONS.md` or the launch issue tracker;
- the rollback/recovery path is understood;
- the team can demonstrate the complete core loop live.

## The live demonstration

The final launch demonstration must show, end-to-end:

```text
A real business signal arrives
        ↓
Agba receives it
        ↓
Agba stores and understands it
        ↓
Agba updates company memory
        ↓
Agba identifies why it matters
        ↓
Agba surfaces it to the executive
        ↓
Agba recommends or prepares an action
        ↓
Human approves where required
        ↓
Action executes
        ↓
Outcome is recorded
        ↓
Agba remembers the outcome
```

**If we cannot demonstrate this loop reliably, we are not finished.**