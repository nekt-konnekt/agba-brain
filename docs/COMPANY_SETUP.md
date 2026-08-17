# Company Setup

## Goal

Create the minimum structure Agba needs to understand a real company before reporting begins.

## Setup sequence

1. Create organization.
2. Set company name, slug, timezone, and currency.
3. Create CEO identity linked to Supabase Auth.
4. Create departments.
5. Create Department Head identities.
6. Assign each Department Head to exactly one department in V1.
7. Verify role and organization boundaries.
8. Mark company setup complete.

## V1 constraints

- One user belongs to one Agba organization.
- A Department Head owns one department in V1.
- A CEO can operate across the entire organization.
- Department names are company data and can be visible to authenticated members of the organization, but operational records remain scoped.

## Provisioning

User creation should be performed by a trusted server-side flow. The browser must not be allowed to assign itself the CEO role or move itself between departments.

## First-run state

After setup, Agba should know:

- who the CEO is;
- which departments exist;
- who owns each department;
- company timezone and currency;
- whether reporting has started;
- which setup fields remain incomplete.

The next workflow after setup is reporting ingestion.