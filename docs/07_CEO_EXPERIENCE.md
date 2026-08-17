# 07 CEO Experience

## Core idea

The CEO should not need to browse company software to understand the company. Agba should bring the important state forward and let the CEO interrogate it conversationally.

## Agba's Office

Agba's Office is the mini CEO cockpit. It is deliberately small.

### 1. Company pulse

A compact view of the current operating state:

- revenue signal;
- expense signal;
- active issues;
- blocked work;
- department reporting status;
- meaningful changes.

### 2. Needs your attention

Items that require a CEO decision, intervention, approval, or follow-up.

### 3. What changed

Material changes since the previous meaningful period, with evidence.

### 4. Department pulse

A concise view of each department, focused on health, progress, risk, and missing reports rather than vanity metrics.

### 5. Recent decisions

Important decisions and their current status.

### 6. Ask Agba

A persistent conversational entry point. The CEO can ask things such as:

- What is happening in sales?
- Why did expenses jump?
- Which department is currently blocked?
- What changed since yesterday?
- What am I supposed to decide today?

## Design rule

The cockpit is a surface over Agba's company memory. It is not a second source of truth and should not contain manually maintained dashboard-only state.

## CEO daily flow

```text
Open Agba's Office
   ↓
See what changed
   ↓
See what needs attention
   ↓
Ask Agba for context
   ↓
Make / confirm decisions
   ↓
Agba records the decision
```

## V1 constraint

Keep the cockpit intentionally small. If a card does not help the CEO understand the business, spot a problem, or make a decision, it probably does not belong in V1.