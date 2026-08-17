# Agba

Agba is the company's operating brain. It receives structured and natural-language reports from the CEO and department heads, maintains company memory, detects important changes, and gives the right person the right intelligence.

## V1 users

- CEO: full company intelligence.
- Department Head: department intelligence plus the company context explicitly permitted by policy.
- Agba: the reasoning layer over governed company data. It does not grant access by itself.

## Core product surface

The primary interface is conversation and reporting. The CEO also gets **Agba's Office**, a small executive cockpit for actual company state, exceptions, priorities, and recent decisions. It is not a generic analytics dashboard.

## Repository

```text
agba-brain/
├── docs/
│   ├── 01_PRODUCT.md
│   ├── 02_PRINCIPLES.md
│   ├── 03_AGBA_BEHAVIOR.md
│   ├── 04_ARCHITECTURE.md
│   ├── 05_DATABASE.md
│   ├── 06_REPORTING.md
│   ├── 07_CEO_EXPERIENCE.md
│   ├── COMPANY_SETUP.md
│   ├── COMPANY_SETUP_API.md
│   ├── FLOW.md
│   ├── V1_SCOPE.md
│   └── DECISIONS.md
└── supabase/
    ├── functions/
    │   └── company-setup/
    │       └── index.ts
    └── migrations/
        ├── 20260817120000_001_agba_v1_core.sql
        └── 20260817133000_company_setup.sql
```

The uploaded ZIP files in the repository are retained as historical artifacts. The source-of-truth files are the readable Markdown, SQL, and TypeScript files in this tree.

## Build order

1. Product and behavior contract
2. Database and RLS
3. Company setup
4. Reporting ingestion
5. Agba reasoning and briefing
6. Agba's Office

## Security rule

Authorization is enforced in PostgreSQL and application services. The model never decides whether a user is allowed to see a record.

## Company Setup

Company provisioning is server-side. The `company-setup` Supabase Edge Function authenticates the CEO, creates the organization, provisions the CEO identity, invites Department Heads, assigns departments, and marks setup complete. The browser is never trusted to assign its own Agba role or department.
