-- Admin console: role-scoped account directory, case routing, and action history.
-- Admins may manage patient/doctor profiles and case workflow, but cannot read
-- doctor-only internal notes or create additional admins through the app API.

create table public.admin_user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  updated_at timestamptz not null default now()
);

alter table public.admin_user_directory enable row level security;
create policy admin_user_directory_select on public.admin_user_directory
  for select to authenticated
  using ((select private.current_app_role()) = 'admin'::public.app_role);
grant select on public.admin_user_directory to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.admin_user_directory from anon, authenticated;

create or replace function private.sync_admin_user_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null then
    insert into public.admin_user_directory (user_id, email, updated_at)
    values (new.id, lower(new.email), now())
    on conflict (user_id) do update
      set email = excluded.email, updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function private.sync_admin_user_directory() from public, anon, authenticated;

create trigger sync_admin_user_directory
  after insert or update of email on auth.users
  for each row execute function private.sync_admin_user_directory();

insert into public.admin_user_directory (user_id, email, updated_at)
select id, lower(email), now()
from auth.users
where email is not null
on conflict (user_id) do update
  set email = excluded.email, updated_at = now();

drop policy if exists profile_update_admin on public.profiles;
create policy profile_update_admin on public.profiles
  for update to authenticated
  using ((select private.current_app_role()) = 'admin'::public.app_role)
  with check (
    (select private.current_app_role()) = 'admin'::public.app_role
    and id <> (select auth.uid())
    and role in ('patient'::public.app_role, 'doctor'::public.app_role)
  );
grant update (display_name, role, is_active) on public.profiles to authenticated;

drop policy if exists case_update_admin on public.cases;
create policy case_update_admin on public.cases
  for update to authenticated
  using ((select private.current_app_role()) = 'admin'::public.app_role)
  with check (
    (select private.current_app_role()) = 'admin'::public.app_role
    and (
      assigned_doctor_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = assigned_doctor_id
          and p.role = 'doctor'::public.app_role
          and p.is_active
      )
    )
  );
grant update (assigned_doctor_id, status) on public.cases to authenticated;

-- Administrators can oversee conversations, but only the patient and assigned
-- doctor may write to them.
drop policy if exists message_insert_participant on public.case_messages;
create policy message_insert_participant on public.case_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.current_app_role()) in ('patient'::public.app_role, 'doctor'::public.app_role)
    and exists (
      select 1 from public.cases c
      where c.id = case_id
        and (c.patient_id = (select auth.uid()) or c.assigned_doctor_id = (select auth.uid()))
    )
  );

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (target_type in ('profile', 'case')),
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);
alter table public.admin_audit_log enable row level security;
create policy admin_audit_log_select on public.admin_audit_log
  for select to authenticated
  using ((select private.current_app_role()) = 'admin'::public.app_role);
create policy admin_audit_log_insert on public.admin_audit_log
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (select private.current_app_role()) = 'admin'::public.app_role
  );
grant select, insert on public.admin_audit_log to authenticated;
grant usage, select on sequence public.admin_audit_log_id_seq to authenticated;
revoke update, delete, truncate, references, trigger on public.admin_audit_log from anon, authenticated;
revoke all on public.admin_audit_log from anon;
revoke all on public.admin_user_directory from anon;

-- Make PostgREST aware of the new admin tables after this migration commits.
notify pgrst, 'reload schema';
