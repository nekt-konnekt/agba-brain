-- Staff onboarding supports both Department Heads and Employees.
alter type public.agba_role_code add value if not exists 'employee';
