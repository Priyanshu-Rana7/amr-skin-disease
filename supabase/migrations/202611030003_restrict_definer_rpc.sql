-- Keep privileged helper functions out of the PostgREST/GraphQL RPC surface.
-- RLS still needs to invoke the authorization helpers, so move those to an
-- unexposed schema and grant only schema/function access required by RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid()) and is_active
$$;

create or replace function private.can_access_case(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target
      and (
        c.patient_id = (select auth.uid())
        or c.assigned_doctor_id = (select auth.uid())
        or (select private.current_app_role()) = 'admin'::public.app_role
      )
  )
$$;

revoke all on function private.current_app_role() from public, anon, authenticated;
revoke all on function private.can_access_case(uuid) from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.can_access_case(uuid) to authenticated;

drop policy profile_select on public.profiles;
create policy profile_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.current_app_role()) = 'admin'::public.app_role
  or exists (
    select 1 from public.cases c
    where (c.patient_id = (select auth.uid()) and c.assigned_doctor_id = profiles.id)
       or (c.assigned_doctor_id = (select auth.uid()) and c.patient_id = profiles.id)
  )
);

drop policy case_select_participant on public.cases;
create policy case_select_participant on public.cases for select to authenticated
using ((select private.can_access_case(id)));

drop policy case_update_doctor on public.cases;
create policy case_update_doctor on public.cases for update to authenticated
using (assigned_doctor_id = (select auth.uid()) and (select private.current_app_role()) = 'doctor'::public.app_role)
with check (assigned_doctor_id = (select auth.uid()) and (select private.current_app_role()) = 'doctor'::public.app_role);

drop policy asset_select_participant on public.case_assets;
create policy asset_select_participant on public.case_assets for select to authenticated
using ((select private.can_access_case(case_id)));

drop policy message_select_participant on public.case_messages;
create policy message_select_participant on public.case_messages for select to authenticated
using ((select private.can_access_case(case_id)));

drop policy message_insert_participant on public.case_messages;
create policy message_insert_participant on public.case_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select private.can_access_case(case_id)));

drop policy prediction_select_participant on public.prediction_runs;
create policy prediction_select_participant on public.prediction_runs for select to authenticated
using ((select private.can_access_case(case_id)));

drop policy internal_notes_assigned_doctor on public.doctor_internal_notes;
create policy internal_notes_assigned_doctor on public.doctor_internal_notes for all to authenticated
using (
  doctor_id = (select auth.uid())
  and (select private.current_app_role()) = 'doctor'::public.app_role
  and exists (select 1 from public.cases c where c.id = doctor_internal_notes.case_id and c.assigned_doctor_id = (select auth.uid()))
)
with check (
  doctor_id = (select auth.uid())
  and (select private.current_app_role()) = 'doctor'::public.app_role
  and exists (select 1 from public.cases c where c.id = doctor_internal_notes.case_id and c.assigned_doctor_id = (select auth.uid()))
);

drop policy review_select_published_or_doctor on public.doctor_reviews;
create policy review_select_published_or_doctor on public.doctor_reviews for select to authenticated
using (
  (published_at is not null and exists (select 1 from public.cases c where c.id = doctor_reviews.case_id and c.patient_id = (select auth.uid())))
  or exists (
    select 1 from public.cases c
    where c.id = doctor_reviews.case_id
      and c.assigned_doctor_id = (select auth.uid())
      and (select private.current_app_role()) = 'doctor'::public.app_role
  )
  or (select private.current_app_role()) = 'admin'::public.app_role
);

drop policy review_insert_assigned_doctor on public.doctor_reviews;
create policy review_insert_assigned_doctor on public.doctor_reviews for insert to authenticated
with check (
  doctor_id = (select auth.uid())
  and (select private.current_app_role()) = 'doctor'::public.app_role
  and exists (select 1 from public.cases c where c.id = doctor_reviews.case_id and c.assigned_doctor_id = (select auth.uid()))
);

drop policy review_update_assigned_doctor on public.doctor_reviews;
create policy review_update_assigned_doctor on public.doctor_reviews for update to authenticated
using (doctor_id = (select auth.uid()) and (select private.current_app_role()) = 'doctor'::public.app_role)
with check (
  doctor_id = (select auth.uid())
  and (select private.current_app_role()) = 'doctor'::public.app_role
  and exists (select 1 from public.cases c where c.id = doctor_reviews.case_id and c.assigned_doctor_id = (select auth.uid()))
);

drop policy case_image_select on storage.objects;
create policy case_image_select on storage.objects for select to authenticated
using (bucket_id = 'case-images' and (select private.can_access_case(((storage.foldername(name))[1])::uuid)));

-- These functions are invoked only by their existing triggers/event trigger.
-- Trigger execution does not require API roles to have direct EXECUTE grants.
revoke all on function public.assign_case_to_doctor() from public, anon, authenticated;
revoke all on function public.create_patient_profile() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- The public copies are no longer referenced by policies and must not be RPCs.
revoke all on function public.current_app_role() from public, anon, authenticated;
revoke all on function public.can_access_case(uuid) from public, anon, authenticated;
