# Agba V1 Flow

```text
                         AGBA
                          │
              Company memory + reasoning
                          │
             ┌────────────┴────────────┐
             │                         │
            CEO                  Department Head
             │                         │
             ▼                         ▼
       Full company              Department scope
       intelligence              + permitted context
```

## Company setup

```text
Create organization
   ↓
Create CEO identity
   ↓
Create departments
   ↓
Create Department Head identities
   ↓
Assign role + department
   ↓
Company ready
```

## Reporting

```text
Department Head speaks naturally
   ↓
Agba creates raw report
   ↓
Extracts facts / metrics / tasks / money / issues
   ↓
Validates and stores normalized records
   ↓
Links evidence
   ↓
Updates memory and observations
   ↓
Replies with acknowledgement + important follow-up
```

## CEO briefing

```text
Scheduled / requested briefing
   ↓
Retrieve authorized company state
   ↓
Compare recent periods
   ↓
Identify exceptions and changes
   ↓
Rank by business importance
   ↓
Generate evidence-backed briefing
   ↓
Persist briefing artifacts if needed
```

## CEO Office

```text
Agba's Office
 ├── Company pulse
 ├── Needs your attention
 ├── What changed
 ├── Department pulse
 ├── Recent decisions
 └── Ask Agba
```

## Security boundary

```text
Identity
  ↓
Role + organization + department
  ↓
RLS / application policy
  ↓
Authorized records only
  ↓
Model context
  ↓
Answer
```

The model never receives restricted data and then gets asked to hide it.