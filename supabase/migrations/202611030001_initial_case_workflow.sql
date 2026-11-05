-- SkinLab academic demonstration workflow. Review before applying to a hosted project.
create extension if not exists pgcrypto;
create type public.app_role as enum ('patient','doctor','admin');
create type public.case_kind as enum ('lesion','mdr');
create type public.case_status as enum ('submitted','awaiting_review','in_review','awaiting_patient','reviewed','closed');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', role public.app_role not null default 'patient',
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.cases (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.profiles(id),
 assigned_doctor_id uuid references public.profiles(id), kind public.case_kind not null,
 status public.case_status not null default 'submitted', patient_summary text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.case_assets (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 storage_path text not null unique, media_type text not null, created_at timestamptz not null default now()
);
create table public.prediction_runs (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 model_name text not null, model_version text not null, inputs jsonb not null default '{}'::jsonb,
 output jsonb not null default '{}'::jsonb, preliminary_summary text not null default '',
 created_at timestamptz not null default now()
);
create table public.case_messages (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 sender_id uuid not null references public.profiles(id), body text not null check (char_length(trim(body)) between 1 and 10000),
 created_at timestamptz not null default now()
);
create table public.doctor_internal_notes (id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade, doctor_id uuid not null references public.profiles(id), note text not null, created_at timestamptz not null default now());
create table public.doctor_reviews (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 doctor_id uuid not null references public.profiles(id), internal_notes text not null default '',
 patient_assessment text, follow_up_instructions text, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index cases_patient_created_idx on public.cases(patient_id,created_at desc);
create index cases_doctor_status_idx on public.cases(assigned_doctor_id,status,created_at);
create index predictions_case_created_idx on public.prediction_runs(case_id,created_at desc);
create index messages_case_created_idx on public.case_messages(case_id,created_at);

create function public.current_app_role() returns public.app_role language sql stable security definer set search_path=''
as $$ select role from public.profiles where id=(select auth.uid()) and is_active $$;
create function public.can_access_case(target uuid) returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.cases c where c.id=target and (c.patient_id=(select auth.uid()) or c.assigned_doctor_id=(select auth.uid()) or public.current_app_role()='admin')) $$;
revoke all on function public.current_app_role() from public,anon;
revoke all on function public.can_access_case(uuid) from public,anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.can_access_case(uuid) to authenticated;

create function public.create_patient_profile() returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.profiles(id,display_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),'patient') on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_patient_profile();

create function public.assign_case_to_doctor() returns trigger language plpgsql security definer set search_path=''
as $$ begin
 select p.id into new.assigned_doctor_id from public.profiles p where p.role='doctor' and p.is_active
 order by (select count(*) from public.cases c where c.assigned_doctor_id=p.id and c.status in ('submitted','awaiting_review','in_review','awaiting_patient')),p.id limit 1;
 if new.assigned_doctor_id is not null then new.status='awaiting_review'; end if; return new;
end $$;
create trigger assign_new_case before insert on public.cases for each row execute function public.assign_case_to_doctor();

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_assets enable row level security;
alter table public.prediction_runs enable row level security;
alter table public.case_messages enable row level security;
alter table public.doctor_reviews enable row level security;
create policy profile_select on public.profiles for select to authenticated using(id=(select auth.uid()) or public.current_app_role()='admin' or exists(select 1 from public.cases c where (c.patient_id=(select auth.uid()) and c.assigned_doctor_id=profiles.id) or (c.assigned_doctor_id=(select auth.uid()) and c.patient_id=profiles.id)));
create policy profile_insert_patient on public.profiles for insert to authenticated with check(id=(select auth.uid()) and role='patient');
create policy profile_update_patient on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()) and role='patient');
grant select,insert on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy case_select_participant on public.cases for select to authenticated using(public.can_access_case(id));
create policy case_insert_patient on public.cases for insert to authenticated with check(patient_id=(select auth.uid()) and status in ('submitted','awaiting_review'));
create policy case_update_doctor on public.cases for update to authenticated using(assigned_doctor_id=(select auth.uid()) and public.current_app_role()='doctor') with check(assigned_doctor_id=(select auth.uid()) and public.current_app_role()='doctor');
grant select,insert on public.cases to authenticated;
grant update(status,patient_summary) on public.cases to authenticated;
create policy asset_select_participant on public.case_assets for select to authenticated using(public.can_access_case(case_id));
create policy asset_insert_patient on public.case_assets for insert to authenticated with check(exists(select 1 from public.cases c where c.id=case_id and c.patient_id=(select auth.uid())));
grant select,insert on public.case_assets to authenticated;
create policy prediction_select_participant on public.prediction_runs for select to authenticated using(public.can_access_case(case_id));
grant select on public.prediction_runs to authenticated;
grant select,insert on public.prediction_runs to service_role;
create policy message_select_participant on public.case_messages for select to authenticated using(public.can_access_case(case_id));
create policy message_insert_participant on public.case_messages for insert to authenticated with check(sender_id=(select auth.uid()) and public.can_access_case(case_id));
grant select,insert on public.case_messages to authenticated;
create policy review_select_published_or_doctor on public.doctor_reviews for select to authenticated using((published_at is not null and exists(select 1 from public.cases c where c.id=case_id and c.patient_id=(select auth.uid()))) or (exists(select 1 from public.cases c where c.id=case_id and c.assigned_doctor_id=(select auth.uid()) and public.current_app_role()='doctor')) or public.current_app_role()='admin');
create policy review_insert_assigned_doctor on public.doctor_reviews for insert to authenticated with check(doctor_id=(select auth.uid()) and public.current_app_role()='doctor' and exists(select 1 from public.cases c where c.id=case_id and c.assigned_doctor_id=(select auth.uid())));
create policy review_update_assigned_doctor on public.doctor_reviews for update to authenticated using(doctor_id=(select auth.uid()) and public.current_app_role()='doctor') with check(doctor_id=(select auth.uid()) and public.current_app_role()='doctor' and exists(select 1 from public.cases c where c.id=case_id and c.assigned_doctor_id=(select auth.uid())));
grant select,insert,update on public.doctor_reviews to authenticated;
alter table public.doctor_internal_notes enable row level security;
create policy internal_notes_assigned_doctor on public.doctor_internal_notes for all to authenticated using(doctor_id=(select auth.uid()) and public.current_app_role()='doctor' and exists(select 1 from public.cases c where c.id=case_id and c.assigned_doctor_id=(select auth.uid()))) with check(doctor_id=(select auth.uid()) and public.current_app_role()='doctor' and exists(select 1 from public.cases c where c.id=case_id and c.assigned_doctor_id=(select auth.uid())));
grant select,insert,update on public.doctor_internal_notes to authenticated;
revoke all on public.profiles,public.cases,public.case_assets,public.prediction_runs,public.case_messages,public.doctor_reviews,public.doctor_internal_notes from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('case-images','case-images',false,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy case_image_select on storage.objects for select to authenticated using(bucket_id='case-images' and public.can_access_case(((storage.foldername(name))[1])::uuid));
create policy case_image_insert_patient on storage.objects for insert to authenticated with check(bucket_id='case-images' and exists(select 1 from public.cases c where c.id=((storage.foldername(name))[1])::uuid and c.patient_id=(select auth.uid())));
