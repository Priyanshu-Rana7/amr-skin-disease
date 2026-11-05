-- Allow authenticated patients to attach a model run to their own case.
create policy prediction_insert_own_patient_case on public.prediction_runs
for insert to authenticated
with check (exists (
  select 1 from public.cases c
  where c.id = case_id and c.patient_id = (select auth.uid())
));
grant insert on public.prediction_runs to authenticated;
