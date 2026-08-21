-- Agba V1 company setup service-role privileges
-- The company-setup Edge Function uses the Supabase service role to provision
-- organizations, users, departments, and their role assignments.

-- Reads performed directly by company-setup and by the user-assignment trigger.
grant select on table public.agba_roles to service_role;
grant select on table public.agba_users to service_role;
grant select on table public.agba_departments to service_role;

-- Organization provisioning and completion.
grant select, insert, update, delete on table public.agba_organizations to service_role;

-- CEO and department-head provisioning.
grant select, insert on table public.agba_users to service_role;

-- Department provisioning.
grant select, insert on table public.agba_departments to service_role;
