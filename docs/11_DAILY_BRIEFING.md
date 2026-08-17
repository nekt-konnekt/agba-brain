# 11 Daily Briefing

## Purpose

The Daily Briefing is Agba's daily executive conversation with the CEO.

It is not a dashboard dump. It is a prioritized explanation of what changed, what matters, what is unresolved, and what deserves the CEO's attention.

## Briefing hierarchy

```text
What changed?
     ↓
Why does it matter?
     ↓
What is still unresolved?
     ↓
What needs a decision or action?
     ↓
What should the CEO keep watching?
```

## Audience

### CEO

The CEO receives company-wide intelligence, including cross-department relationships, material risks, financial movements, unresolved decisions, and important trends.

### Department Head

A Department Head receives intelligence within their permitted department scope, plus company context explicitly made visible to them. A Department Head does not receive unrestricted company intelligence merely because they can ask Agba questions.

## Daily briefing sections

V1 should normally contain:

1. **Good morning / current state**
2. **What changed**
3. **Needs your attention**
4. **Open issues**
5. **Money**
6. **Tasks and commitments**
7. **Decisions waiting**
8. **Watch list**

Sections with no meaningful information should be omitted rather than padded with empty prose.

## Prioritization

Agba should rank briefing items using evidence-backed signals:

- severity
- financial materiality
- urgency
- deadline proximity
- recurrence
- deviation from baseline
- unresolved duration
- cross-department impact
- CEO decision requirement

The ranking should not be a black-box score that the CEO cannot understand. Agba should be able to explain why an item is prominent.

## Briefing item format

Internally, a briefing item should retain:

```json
{
  "type": "issue",
  "priority": "high",
  "title": "Two sales orders remain unpaid",
  "summary": "₦180k is still outstanding across two orders.",
  "why_it_matters": "The same payment delay appeared yesterday.",
  "action": "Follow up with both customers today.",
  "evidence": ["..."],
  "confidence": "high"
}
```

The natural-language rendering can be conversational, but the structured source remains canonical.

## Memory across briefings

Agba should remember unresolved matters.

Example:

```text
Monday:
"Two customers are waiting for payment."

Tuesday:
"Those two payments are still outstanding."

Wednesday:
"The same two payments have now been outstanding for three days."
```

The third briefing should feel like Agba noticed the passage of time, not like it rediscovered the same database row.

## Silence is valid

Agba should not manufacture urgency.

If nothing material happened, the briefing can be short:

> "Quiet day. Nothing material changed across the company. Two routine tasks remain open."

A short briefing is better than executive spam.

## Questions

When evidence is incomplete, Agba should ask a focused question rather than inventing an answer.

Example:

> "Finance and Operations reported different delivery expenses yesterday. Which figure should I treat as final?"

## Human tone

Agba should sound like a competent chief of staff who knows the company, not like an analytics dashboard.

Prefer:

> "Sales was strong yesterday, but cash collection is lagging. Two orders worth ₦180k are still unpaid."

Avoid:

> "Revenue performance was positive while accounts receivable exhibited a negative variance."

## Actions

A briefing may contain recommended actions, but recommendation and execution remain distinct.

Agba can say:

> "I recommend following up with the two customers today."

Agba should not silently mark the customers contacted unless an authorized system or person confirms that action.

## Briefing lifecycle

```text
Evidence
  ↓
Reasoning
  ↓
Prioritization
  ↓
Briefing draft
  ↓
Evidence validation
  ↓
Audience / permission check
  ↓
Deliver
  ↓
Record briefing
```

A delivered briefing should remain auditable so Agba can explain what it knew and why it said something at that time.
