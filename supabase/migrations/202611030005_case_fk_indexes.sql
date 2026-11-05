-- Cover foreign-key and case-history lookups used by the patient/doctor flow.
create index if not exists case_assets_case_id_idx
  on public.case_assets (case_id);
create index if not exists case_messages_sender_id_idx
  on public.case_messages (sender_id);
create index if not exists doctor_internal_notes_case_created_idx
  on public.doctor_internal_notes (case_id, created_at desc);
create index if not exists doctor_internal_notes_doctor_id_idx
  on public.doctor_internal_notes (doctor_id);
create index if not exists doctor_reviews_case_created_idx
  on public.doctor_reviews (case_id, created_at desc);
create index if not exists doctor_reviews_doctor_id_idx
  on public.doctor_reviews (doctor_id);
