-- Avoid an RLS recursion loop when an administrator assigns a case.
-- The case UPDATE policy cannot query profiles directly because profiles'
-- SELECT policy also reads cases. This private helper bypasses that nested RLS
-- check and only returns true for an authenticated administrator and an
-- active doctor account.
create or replace function private.admin_can_assign_doctor(target_doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select private.current_app_role()) = 'admin'::public.app_role
    and exists (
      select 1
      from public.profiles as p
      where p.id = target_doctor
        and p.role = 'doctor'::public.app_role
        and p.is_active
    )
$$;

revoke all on function private.admin_can_assign_doctor(uuid) from public, anon, authenticated;
grant execute on function private.admin_can_assign_doctor(uuid) to authenticated;

drop policy if exists case_update_admin on public.cases;
create policy case_update_admin on public.cases
  for update to authenticated
  using ((select private.current_app_role()) = 'admin'::public.app_role)
  with check (
    (select private.current_app_role()) = 'admin'::public.app_role
    and (
      assigned_doctor_id is null
      or (select private.admin_can_assign_doctor(assigned_doctor_id))
    )
  );
