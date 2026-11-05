# Supabase setup

The first migration creates the academic demonstration case workflow: profiles, cases, image references, prediction history, patient/doctor messages, published reviews, doctor-only notes, Row Level Security policies, and a private `case-images` bucket. It assigns a new case to the active doctor with the fewest open cases. If no doctor profiles are active, the case remains submitted and unassigned.

## Apply migrations

The hosted project is managed by the timestamped files in `supabase/migrations`. Apply them with the Supabase CLI so the migration history stays in sync:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase db push --linked --dry-run
supabase db push --linked
```

Do not paste migration SQL into the SQL Editor. The SQL Editor applies the schema but does not write to `supabase_migrations.schema_migrations`, which makes the Supabase Preview check fail later.

The initial migration is a one-time schema, not an idempotent script. Never re-run it on an existing database. For later schema updates, add a new timestamped migration with `supabase migration new <name>` instead of editing an applied file.

After the initial schema, migrations 002–005 add:

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

## Troubleshooting: Supabase Preview migration errors

The Supabase GitHub check applies the committed migrations to the production project and to preview branches cloned from it. If it fails with:

```text
Remote migration versions not found in local migrations directory.
```

the database's `supabase_migrations.schema_migrations` table contains version numbers that have no matching file in `supabase/migrations`.

This usually happens when migrations were applied outside the repository (for example, pasted into the SQL Editor) or when a migration file was renamed or re-timestamped after it had already been pushed. Preview branches inherit the base project's migration history, so one stale row on the base project fails every preview.

### Diagnose

Open the failed check, then **Supabase Dashboard → Branches → View Logs**, or compare the histories with the CLI:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase migration list --linked
```

Versions shown as remote-only are the ones missing from the repository.

### Repair

`supabase migration repair` only edits the history table; it does not run or undo SQL. Use it when you know the database schema is already in the desired state.

```bash
# A version exists remotely but not in the repository:
supabase migration repair <version> --status reverted --linked

# A repository migration is already applied but missing from remote history:
supabase migration repair <version> --status applied --linked

# Confirm local and remote histories now match:
supabase migration list --linked
```

The hosted project for this repository is baselined to the committed versions:

```text
202611030001  initial_case_workflow
202611030002  prediction_patient_insert
202611030003  restrict_definer_rpc
202611030004  patient_case_role
202611030005  case_fk_indexes
20261103175940 case_select_returning
```

If only a preview branch is broken, reset it from **Branches → reset branch** (or delete it and reopen the pull request). Preview data is disposable and is recreated from the base project plus the committed migrations.

Do not force the initial migration onto an existing schema with `supabase db push --include-all`. `202611030001_initial_case_workflow.sql` uses `create type` and `create table` without `if not exists`, so re-running it will fail.

### Preventing it

- Create migrations with `supabase migration new <name>` so the version prefix is a real timestamp.
- Never rename or re-timestamp a migration after it has been pushed.
- Apply remote schema changes through `supabase db push`, not the SQL Editor.
- Commit migration files before pushing; the Supabase integration only applies committed migrations.
