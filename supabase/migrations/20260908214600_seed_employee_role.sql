insert into public.agba_roles (code, name)
select 'employee', 'Employee'
where not exists (select 1 from public.agba_roles where code = 'employee');
