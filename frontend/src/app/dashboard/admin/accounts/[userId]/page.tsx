import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateManagedProfile } from "../../actions";
import AdminToast from "../../AdminToast";
import AdminProfileForm from "./AdminProfileForm";

const NOTICES: Record<string, string> = {
  "user-updated": "Account changes saved successfully.",
  "invalid-user": "Check the account details and try again.",
  "protected-user": "Administrator accounts cannot be changed here.",
  "reassign-first": "Reassign or close this doctor's open cases before deactivating the account.",
  "user-update-failed": "The account could not be updated. Check the database connection and try again.",
  "profile-saved-audit-failed": "The account change was saved, but its audit entry could not be recorded. Contact the project administrator before making further access changes.",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  awaiting_patient: "Awaiting patient",
  reviewed: "Reviewed",
  closed: "Closed",
};

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default async function AdminAccountPage({ params, searchParams }: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ notice?: string; saved?: string }>;
}) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!viewer?.is_active) redirect("/login");
  if (viewer.role !== "admin") redirect("/dashboard");

  const { data: account } = await supabase
    .from("profiles")
    .select("id,display_name,role,is_active,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!account) notFound();

  const [directoryResult, casesResult] = await Promise.all([
    supabase.from("admin_user_directory").select("email").eq("user_id", userId).maybeSingle(),
    account.role === "patient"
      ? supabase.from("cases").select("id,kind,status,created_at").eq("patient_id", userId).order("created_at", { ascending: false }).limit(20)
      : account.role === "doctor"
        ? supabase.from("cases").select("id,kind,status,created_at").eq("assigned_doctor_id", userId).order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: [], error: null }),
  ]);

  const email = directoryResult.data?.email || "Email not available";
  const caseList = casesResult.data ?? [];
  const accountLabel = account.role === "doctor" ? "Doctor" : account.role === "admin" ? "Administrator" : "Patient";
  const errorNotice = query.notice && NOTICES[query.notice] && query.notice !== "user-updated" ? NOTICES[query.notice] : null;

  return <main className="simple-view admin-view admin-account-view">
    <Link className="text-link admin-back-link" href="/dashboard/admin#accounts">← Back to accounts</Link>
    {query.notice === "user-updated" && <AdminToast key={query.saved ?? query.notice} message={NOTICES[query.notice]}/>}
    {errorNotice && <p role="alert" className="admin-notice is-error">{errorNotice}</p>}

    <div className="admin-heading">
      <div><span className="pill">ACCOUNT DETAILS</span><h1>{account.display_name || "Name not set"}</h1><p>{email}</p></div>
      <span className={`admin-status admin-account-state ${account.is_active ? "is-active" : "is-inactive"}`}>{account.is_active ? "Active account" : "Inactive account"}</span>
    </div>

    <section className="glass admin-panel admin-account-panel">
      <div className="admin-panel-heading"><div><span className="admin-kicker">PROFILE</span><h2>Account information</h2><p>Manage the account name, workspace access, and active status.</p></div></div>
      <dl className="admin-account-meta">
        <div><dt>Email</dt><dd>{email}</dd></div>
        <div><dt>Current access</dt><dd>{accountLabel}</dd></div>
        <div><dt>Created</dt><dd>{new Date(account.created_at).toLocaleString()}</dd></div>
        <div><dt>Account ID</dt><dd>{account.id}</dd></div>
      </dl>

      {account.role === "admin" ? <div className="admin-protected admin-account-protected"><span className="admin-status">Protected account</span><p>Administrator access is managed through Supabase administration.</p></div> : <AdminProfileForm action={updateManagedProfile} userId={account.id} displayName={account.display_name} role={account.role} isActive={account.is_active}/>}
    </section>

    <section className="glass admin-panel admin-account-panel">
      <div className="admin-panel-heading"><div><span className="admin-kicker">RELATED WORK</span><h2>{account.role === "doctor" ? "Assigned cases" : account.role === "patient" ? "Patient cases" : "Account activity"}</h2><p>{account.role === "doctor" ? "Cases currently assigned to this doctor." : account.role === "patient" ? "Cases submitted from this patient account." : "No cases are linked to administrator accounts."}</p></div><span className="admin-count">{caseList.length} shown</span></div>
      {caseList.length ? <div className="admin-account-cases">{caseList.map(item => <Link href={`/dashboard/cases/${item.id}`} key={item.id}>
        <span><strong>{item.kind === "lesion" ? "Skin image case" : "Antibiotic resistance case"}</strong><small>{new Date(item.created_at).toLocaleString()}</small></span>
        <span className="admin-status">{STATUS_LABELS[item.status] ?? item.status.replaceAll("_", " ")}</span>
        <span aria-hidden="true">Open case →</span>
      </Link>)}</div> : <p className="admin-empty">No cases are linked to this account yet.</p>}
      {caseList.length === 20 && <p className="admin-footnote">Showing the 20 most recent related cases.</p>}
    </section>
    <p className="admin-privacy-note">Changing a role changes which workspace this account can access. Deactivating a doctor requires their open cases to be reassigned first.</p>
  </main>;
}
