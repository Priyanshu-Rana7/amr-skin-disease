-- Match database authorization to the patient-only case submission route.
drop policy case_insert_patient on public.cases;
create policy case_insert_patient on public.cases for insert to authenticated
with check (
  patient_id = (select auth.uid())
  and (select private.current_app_role()) = 'patient'::public.app_role
  and status in ('submitted', 'awaiting_review')
);
