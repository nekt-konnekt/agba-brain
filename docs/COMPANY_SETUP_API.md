# Company Setup API

## Purpose

`company-setup` is the trusted server-side provisioning flow for the first Agba company setup.

The browser never assigns itself a role, organization, or department. The function authenticates the caller, provisions the organization, establishes the caller as CEO, invites Department Heads, assigns departments, and marks setup complete.

## Endpoint

```text
POST /functions/v1/company-setup
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

## Request

```json
{
  "company": {
    "name": "Acme Ltd",
    "slug": "acme-ltd",
    "timezone": "Africa/Lagos",
    "currency_code": "NGN"
  },
  "ceo": {
    "full_name": "Jane Doe"
  },
  "departments": [
    {
      "name": "Operations",
      "slug": "operations",
      "description": "Day-to-day operations",
      "head": {
        "full_name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

## Behavior

1. Validate the caller's Supabase Auth token.
2. Reject callers already provisioned in Agba.
3. Create the organization.
4. Create the caller as the CEO.
5. Create departments.
6. Invite each Department Head through Supabase Auth.
7. Create each Department Head's Agba identity.
8. Mark the organization setup complete.
9. Return the created organization, CEO, and departments.

If provisioning fails, the function performs best-effort cleanup of the organization and invited Department Head accounts.

## V1 constraints

- One Agba organization per authenticated user.
- Exactly one active CEO per organization.
- One active Department Head per department.
- CEO has no department assignment.
- Department Head has exactly one department.
- Department must belong to the same organization as its owner.

## Security

The function requires a valid Supabase Auth access token. Administrative Auth operations use the server-side Supabase service role key, which is never sent to the browser.

RLS remains the enforcement boundary for ordinary application access. This function is a trusted provisioning boundary, not a replacement for RLS.
