# Supabase setup

The first migration creates the academic demonstration case workflow: profiles, cases, image references, prediction history, patient/doctor messages, published reviews, doctor-only notes, Row Level Security policies, and a private `case-images` bucket. It assigns a new case to the active doctor with the fewest open cases. If no doctor profiles are active, the case remains submitted and unassigned.

## Apply the initial migration

1. Open the Supabase project dashboard and select **SQL Editor → New query**.
2. Open `migrations/202611030001_initial_case_workflow.sql` in this repository and paste the full contents into the query editor.
3. Review the SQL, then run it once. It creates database objects and policies; it does not create user accounts or insert patient records.

The migration is a one-time initial schema, not an idempotent script. Do not run it a second time if it reports success. For later schema updates, add a new timestamped migration instead of editing an applied migration.

After the initial schema, run each additional migration exactly once, in timestamp order. Migrations 002–005 are applied to the hosted project:

- `202611030002_prediction_patient_insert.sql` allows a patient to save the prediction row for their own case.
- `202611030003_restrict_definer_rpc.sql` moves RLS helpers to a non-exposed schema and removes API execution grants from trigger-only functions.
- `202611030004_patient_case_role.sql` restricts case creation to authenticated patient profiles.
- `202611030005_case_fk_indexes.sql` adds indexes for foreign-key and case-history lookups.

## Doctor demo accounts

Create the three doctor test accounts through **Authentication → Users → Add user** with project-owned test email addresses and strong passwords. Do not use real patient information. After creation, copy each user UUID and promote only those accounts through the SQL Editor:

```sql
update public.profiles
set role = 'doctor', display_name = 'Demo Doctor 1'
where id = 'PASTE_AUTH_USER_UUID_HERE';
```

Repeat for the other test accounts. The signup trigger creates each profile with the patient role; public signup cannot choose or grant a doctor role. Keep demo passwords private and change them before any shared presentation.

## Important scope

Use synthetic or de-identified cases for the academic demo. The policies enforce patient ownership, assigned-doctor access, published patient reviews, private doctor notes, and private image objects. They do not make the existing models clinically validated. The app integration must continue to use server-verified sessions and must never trust a client-supplied role or doctor assignment.
