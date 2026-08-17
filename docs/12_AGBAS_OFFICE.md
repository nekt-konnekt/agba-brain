# 12 Agba's Office

## Purpose

Agba's Office is the human-facing executive cockpit for V1.

It is intentionally small. The primary product remains Agba itself, especially the reporting and conversational experience. The Office exists for the CEO to quickly see the current state, inspect evidence, and act when needed.

## Core principle

**The Office is a window into Agba's understanding, not a replacement for Agba.**

Do not turn it into a conventional BI dashboard filled with charts, filters, and vanity metrics.

## CEO view

The CEO sees:

1. **Agba's opening note**
   - One short statement about the current company state.
2. **Needs attention**
   - Highest-priority issues, risks, overdue commitments, and decisions.
3. **What changed**
   - Material changes since the previous meaningful period.
4. **Money**
   - Revenue, expenses, collections, and unusual movements when evidence exists.
5. **Departments**
   - A compact health view, not unrestricted operational detail by default.
6. **Waiting on you**
   - Decisions or approvals that require the CEO.
7. **Ask Agba**
   - The conversational entry point for deeper questions.

## Department Head view

Department Heads get a smaller Office:

- their department's current state
- their department briefing
- open issues
- tasks and commitments
- relevant metrics
- decisions/approvals they own
- Agba conversation within their permitted scope

They do not receive the CEO's full company intelligence merely because the information exists in the same database.

## Suggested layout

```text
┌────────────────────────────────────────────────────┐
│ AGBA'S OFFICE                         Today, 17 Aug │
├────────────────────────────────────────────────────┤
│                                                    │
│ Agba                                                │
│ "Sales was strong yesterday. Cash collection needs │
│ attention. Two orders worth ₦180k remain unpaid."  │
│                                                    │
├───────────────────────┬────────────────────────────┤
│ NEEDS ATTENTION       │ WAITING ON YOU             │
│ • ₦180k unpaid        │ • Approve ₦120k expense    │
│ • Delivery variance   │ • Decide on supplier       │
├───────────────────────┴────────────────────────────┤
│ WHAT CHANGED                                       │
│ Sales ↑ 18%   Delivery cost ↑   2 tasks overdue    │
├────────────────────────────────────────────────────┤
│ DEPARTMENTS                                        │
│ Sales       Healthy                                │
│ Operations  Watch                                  │
│ Finance     Attention                              │
├────────────────────────────────────────────────────┤
│ Ask Agba:  [ What should I know about today? ]     │
└────────────────────────────────────────────────────┘
```

## Conversation

The Ask Agba surface should support questions such as:

- "What happened yesterday?"
- "Why are you concerned about cash?"
- "What is Operations waiting for?"
- "Show me the evidence behind that."
- "What did we decide about this last week?"
- "What needs my attention today?"

Every substantive answer should be grounded in the same evidence and permission model as the briefing.

## Evidence inspection

A CEO should be able to move from a statement to its supporting evidence.

```text
Agba says:
"Delivery expenses increased 31%."
        ↓
View evidence
        ↓
Reports / entries / dates / source
```

This is essential for trust.

## No fake certainty

If the evidence is incomplete, the Office should say so.

Examples:

> "I don't have enough evidence to explain the increase yet."

> "Finance and Operations reported different figures."

The UI should not disguise uncertainty with a confident-looking chart.

## V1 visual philosophy

Use:

- strong typography
- compact cards
- clear hierarchy
- restrained color use
- timestamps
- status labels
- evidence links
- conversational copy

Avoid:

- dashboard wallpaper
- dozens of charts
- arbitrary scores
- decorative gauges
- excessive notifications
- gamification

## Data boundary

The Office must always resolve the viewer's effective organization and role before loading data.

```text
CEO
  → organization-wide permitted intelligence

Department Head
  → department-scoped intelligence
```

Client-side hiding is not sufficient. Database/API authorization remains authoritative.

## V1 success criterion

A CEO should be able to open Agba's Office and answer within roughly one minute:

1. What happened?
2. What changed?
3. What is going wrong?
4. What needs my attention?
5. What decisions are waiting for me?
6. What should I ask Agba next?

If the Office cannot answer those questions, adding more charts will not fix it.
