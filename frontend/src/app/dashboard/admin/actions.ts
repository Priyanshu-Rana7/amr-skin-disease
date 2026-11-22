"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASE_STATUSES = ["submitted", "awaiting_review", "in_review", "awaiting_patient", "reviewed", "closed"] as const;
type CaseStatus = (typeof CASE_STATUSES)[number];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  return { supabase, user };
}

export async function updateManagedProfile(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("user_id") ?? "");
  const accountPath = UUID.test(id) ? `/dashboard/admin/accounts/${id}` : "/dashboard/admin";
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const isActive = formData.get("is_active") === "on";

  if (!UUID.test(id) || id === user.id || !displayName || displayName.length > 100 || !["patient", "doctor"].includes(role)) {
    redirect(`${accountPath}?notice=invalid-user`);
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id,display_name,role,is_active")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.role === "admin") redirect(`${accountPath}?notice=protected-user`);

  if (existing.role === "doctor" && !isActive) {
    const { data: openCases } = await supabase
      .from("cases")
      .select("id")
      .eq("assigned_doctor_id", id)
      .neq("status", "closed")
      .limit(1);
    if (openCases?.length) redirect(`${accountPath}?notice=reassign-first`);
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, role, is_active: isActive })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) redirect(`${accountPath}?notice=user-update-failed`);

  const { error: auditError } = await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "profile_updated",
    target_type: "profile",
    target_id: id,
    details: {
      role_from: existing.role,
      role_to: role,
      active_from: existing.is_active,
      active_to: isActive,
      display_name_changed: existing.display_name !== displayName,
    },
  });

  if (auditError) {
    console.error("[admin] Profile saved but audit logging failed", JSON.stringify({
      code: auditError.code,
      message: auditError.message,
      details: auditError.details,
      hint: auditError.hint,
    }));
    redirect(`${accountPath}?notice=profile-saved-audit-failed`);
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  redirect(`${accountPath}?notice=user-updated&saved=${Date.now()}`);
}

export async function updateCaseWorkflow(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const caseId = String(formData.get("case_id") ?? "");
  const doctorId = String(formData.get("doctor_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!UUID.test(caseId) || (doctorId && !UUID.test(doctorId)) || !CASE_STATUSES.includes(status as CaseStatus)) {
    redirect("/dashboard/admin?notice=invalid-case");
  }

  const { data: existing } = await supabase
    .from("cases")
    .select("id,assigned_doctor_id,status")
    .eq("id", caseId)
    .maybeSingle();
  if (!existing) redirect("/dashboard/admin?notice=case-update-failed");

  if (doctorId) {
    const { data: doctor } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", doctorId)
      .eq("role", "doctor")
      .eq("is_active", true)
      .maybeSingle();
    if (!doctor) redirect("/dashboard/admin?notice=invalid-doctor");
  }

  const { data: updated, error } = await supabase
    .from("cases")
    .update({ assigned_doctor_id: doctorId || null, status })
    .eq("id", caseId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[admin] Case workflow update failed", JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    }));
    redirect("/dashboard/admin?notice=case-update-failed");
  }
  if (!updated) {
    console.error("[admin] Case workflow update matched no visible row", { caseId });
    redirect("/dashboard/admin?notice=case-update-failed");
  }

  const { error: auditError } = await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "case_workflow_updated",
    target_type: "case",
    target_id: caseId,
    details: {
      doctor_from: existing.assigned_doctor_id,
      doctor_to: doctorId || null,
      status_from: existing.status,
      status_to: status,
    },
  });

  if (auditError) {
    console.error("[admin] Case saved but audit logging failed", JSON.stringify({
      code: auditError.code,
      message: auditError.message,
      details: auditError.details,
      hint: auditError.hint,
    }));
    redirect("/dashboard/admin?notice=case-saved-audit-failed");
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/cases/${caseId}`);
  redirect(`/dashboard/admin?notice=case-updated&saved=${Date.now()}`);
}
