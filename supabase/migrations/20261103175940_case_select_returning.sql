-- INSERT ... RETURNING must evaluate the new row directly. A STABLE helper
-- that queries cases cannot see the row during the inserting statement.
drop policy case_select_participant on public.cases;
create policy case_select_participant on public.cases for select to authenticated
using (
  patient_id = (select auth.uid())
  or assigned_doctor_id = (select auth.uid())
  or (select private.current_app_role()) = 'admin'::public.app_role
);
