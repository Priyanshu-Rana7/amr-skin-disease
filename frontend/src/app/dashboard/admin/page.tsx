import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateCaseWorkflow } from "./actions";
import AdminToast from "./AdminToast";
import PendingSubmitButton from "@/components/PendingSubmitButton";

const STATUSES = ["submitted", "awaiting_review", "in_review", "awaiting_patient", "reviewed", "closed"] as const;
const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  awaiting_patient: "Awaiting patient",
  reviewed: "Reviewed",
  closed: "Closed",
};

const NOTICES: Record<string, string> = {
  "user-updated": "Account settings saved.",
  "case-updated": "Case assignment and status saved.",
  "invalid-user": "Check the account details and try again.",
  "protected-user": "Administrator accounts can only be changed through the Supabase dashboard.",
  "reassign-first": "Reassign or close this doctor's open cases before deactivating the account.",
  "user-update-failed": "The account could not be updated. Check the database migration and try again.",
  "invalid-case": "Choose a valid case, doctor, and status.",
  "invalid-doctor": "That doctor is unavailable. Choose an active doctor.",
  "case-update-failed": "The case assignment or status could not be saved. Refresh the queue and try again.",
  "case-saved-audit-failed": "The case change was saved, but its audit entry could not be recorded. Contact the project administrator before making further workflow changes.",
};

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; saved?: string; case_q?: string; account_q?: string; status?: string; kind?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase.from("profiles").select("role,is_active,display_name").eq("id", user.id).maybeSingle();
  if (!viewer?.is_active) redirect("/login");
  if (viewer.role !== "admin") redirect("/dashboard");

  const [profilesResult, directoryResult, casesResult, auditResult] = await Promise.all([
    supabase.from("profiles").select("id,display_name,role,is_active,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("admin_user_directory").select("user_id,email"),
    supabase.from("cases").select("id,patient_id,assigned_doctor_id,kind,status,patient_summary,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("admin_audit_log").select("id,actor_id,action,target_type,target_id,created_at").order("created_at", { ascending: false }).limit(12),
  ]);

  const profiles = profilesResult.data ?? [];
  const cases = casesResult.data ?? [];
  const directory = new Map((directoryResult.data ?? []).map(item => [item.user_id, item.email]));
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const activeDoctors = profiles.filter(profile => profile.role === "doctor" && profile.is_active);
  const caseQuery = (params.case_q ?? "").trim().toLowerCase();
  const accountQuery = (params.account_q ?? "").trim().toLowerCase();
  const statusFilter = STATUSES.includes(params.status as (typeof STATUSES)[number]) ? params.status : "";
  const kindFilter = params.kind === "lesion" || params.kind === "mdr" ? params.kind : "";
  const visibleProfiles = profiles.filter(profile => {
    if (!accountQuery) return true;
    return [profile.display_name, directory.get(profile.id)].some(value => String(value ?? "").toLowerCase().includes(accountQuery));
  });
  const visibleCases = cases.filter(item => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (kindFilter && item.kind !== kindFilter) return false;
    if (!caseQuery) return true;
    const patient = profileById.get(item.patient_id);
    const doctor = item.assigned_doctor_id ? profileById.get(item.assigned_doctor_id) : null;
    const doctorEmail = item.assigned_doctor_id ? directory.get(item.assigned_doctor_id) : null;
    return [item.id, item.patient_summary, patient?.display_name, directory.get(item.patient_id), doctor?.display_name, doctorEmail].some(value => String(value ?? "").toLowerCase().includes(caseQuery));
  });

  const openCaseCount = cases.filter(item => item.status !== "closed" && item.status !== "reviewed").length;
  const unassignedCount = cases.filter(item => !item.assigned_doctor_id && item.status !== "closed").length;
  const patientCount = profiles.filter(profile => profile.role === "patient").length;
  const doctorCount = profiles.filter(profile => profile.role === "doctor").length;
  const adminTablesMissing = directoryResult.error?.code === "PGRST205" || auditResult.error?.code === "PGRST205";
  const adminDataFailed = profilesResult.error || directoryResult.error || casesResult.error || auditResult.error;

  return <main className="simple-view admin-view">
    <div className="admin-heading">
      <div><span className="pill">SKINLAB ADMINISTRATION</span><h1>Project control room</h1><p>Manage demonstration accounts, route cases to doctors, and monitor the review queue.</p></div>
      <span className="admin-signed-in">Signed in as <strong>{viewer.display_name || user.email || "Administrator"}</strong></span>
    </div>

    {params.notice && NOTICES[params.notice] && (params.notice === "user-updated" || params.notice === "case-updated") && <AdminToast key={params.saved ?? params.notice} message={NOTICES[params.notice]}/>}
    {params.notice && NOTICES[params.notice] && !["user-updated", "case-updated"].includes(params.notice) && <p role="alert" className="admin-notice is-error">{NOTICES[params.notice]}</p>}
    {adminTablesMissing && <p role="alert" className="admin-notice is-error">The admin email directory and activity history are unavailable from Supabase. Check that the admin migration created both tables. If they exist, run <code>NOTIFY pgrst, 'reload schema';</code> in the Supabase SQL Editor. If either is missing, apply the migration once. Then reload this page.</p>}
    {adminDataFailed && !adminTablesMissing && <p role="alert" className="admin-notice is-error">Some administration data could not be loaded. Check the Supabase connection and access policies, then reload this page.</p>}

    <section className="admin-stats" aria-label="Project overview">
      <article className="glass admin-stat"><span>Patient accounts</span><strong>{patientCount}</strong><small>Registered demo users</small></article>
      <article className="glass admin-stat"><span>Doctor accounts</span><strong>{doctorCount}</strong><small>{activeDoctors.length} active and available</small></article>
      <article className="glass admin-stat"><span>Cases in progress</span><strong>{openCaseCount}</strong><small>Excludes reviewed and closed cases</small></article>
      <article className="glass admin-stat"><span>Unassigned cases</span><strong>{unassignedCount}</strong><small>Awaiting a doctor assignment</small></article>
    </section>

    <nav className="admin-shortcuts" aria-label="Admin sections">
      <a href="#cases">Case queue <span>{cases.length}</span></a>
      <a href="#accounts">Accounts <span>{profiles.length}</span></a>
      <a href="#activity">Recent admin activity</a>
    </nav>

    <section className="glass admin-panel" id="cases">
      <div className="admin-panel-heading"><div><span className="admin-kicker">WORKFLOW</span><h2>Case queue</h2><p>Review assignments and status across patient cases.</p></div><span className="admin-count">{visibleCases.length} shown</span></div>
      <form className="admin-filters" action="/dashboard/admin#cases" method="get">
        <label>Search cases<input name="case_q" type="search" defaultValue={params.case_q ?? ""} placeholder="Case ID, patient, doctor, or notes"/></label>
        <label>Case type<select name="kind" defaultValue={kindFilter}><option value="">All case types</option><option value="lesion">Skin image</option><option value="mdr">Antibiotic resistance</option></select></label>
        <label>Status<select name="status" defaultValue={statusFilter}><option value="">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        <button className="action outline admin-filter-button">Filter</button>
      </form>
      {visibleCases.length ? <div className="admin-case-list">{visibleCases.map(item => {
        const patient = profileById.get(item.patient_id);
        const assigned = item.assigned_doctor_id ? profileById.get(item.assigned_doctor_id) : null;
        return <article className="admin-case-row" key={item.id}>
          <div className="admin-case-overview">
            <div className="admin-case-title"><strong>{item.kind === "lesion" ? "Skin image case" : "Antibiotic resistance case"}</strong><span className="admin-status">{STATUS_LABELS[item.status] ?? item.status.replaceAll("_", " ")}</span></div>
            <p>{patient?.display_name || "Patient"} · {directory.get(item.patient_id) || shortId(item.patient_id)}</p>
            <small>Created {new Date(item.created_at).toLocaleString()} · Case {shortId(item.id)}</small>
            {item.patient_summary && <p className="admin-case-summary">{item.patient_summary}</p>}
            <Link className="text-link" href={`/dashboard/cases/${item.id}`}>Open case record →</Link>
          </div>
          <form action={updateCaseWorkflow} className="admin-case-controls">
            <input type="hidden" name="case_id" value={item.id}/>
            <label>Assigned doctor<select name="doctor_id" defaultValue={item.assigned_doctor_id ?? ""}><option value="">Unassigned</option>{activeDoctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.display_name || directory.get(doctor.id) || shortId(doctor.id)}</option>)}</select></label>
            <label>Case status<select name="status" defaultValue={item.status}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
            <PendingSubmitButton className="action mint" label="Save case workflow" pendingLabel="Saving workflow…"/>
            {assigned && !assigned.is_active && <small className="admin-warning">This assigned doctor is inactive. Reassign this case.</small>}
          </form>
        </article>;
      })}</div> : <p className="admin-empty">No cases match these filters.</p>}
      {cases.length === 250 && <p className="admin-footnote">Showing the 250 most recent cases. Use the filters to narrow the list.</p>}
    </section>

    <section className="glass admin-panel" id="accounts">
      <div className="admin-panel-heading"><div><span className="admin-kicker">ACCESS</span><h2>Accounts</h2><p>Update display names, assign patient or doctor access, and deactivate accounts.</p></div><span className="admin-count">{visibleProfiles.length} shown</span></div>
      <form className="admin-filters account-search" action="/dashboard/admin#accounts" method="get"><label>Find an account<input name="account_q" type="search" defaultValue={params.account_q ?? ""} placeholder="Account name or email"/></label><button className="action outline admin-filter-button">Search accounts</button></form>
      {visibleProfiles.length ? <div className="admin-user-list">{visibleProfiles.map(profile => <article className="admin-user-row" key={profile.id}>
        <Link className="admin-user-info admin-user-link" href={`/dashboard/admin/accounts/${profile.id}`}>
          <span className={`admin-avatar role-${profile.role}`}>{profile.role === "doctor" ? "D" : profile.role === "admin" ? "A" : "P"}</span>
          <span className="admin-user-copy"><strong>{profile.display_name || "Name not set"}</strong><span>{directory.get(profile.id) || shortId(profile.id)}</span><small>Added {new Date(profile.created_at).toLocaleDateString()}</small></span>
          <span className="admin-user-open">{profile.role === "admin" ? "View details →" : "Manage account →"}</span>
        </Link>
      </article>)}</div> : <p className="admin-empty">No accounts match your search.</p>}
      <p className="admin-footnote">New accounts are created in Supabase Authentication. Promote or deactivate them here after their profile appears.</p>
    </section>

    <section className="glass admin-panel" id="activity">
      <div className="admin-panel-heading"><div><span className="admin-kicker">AUDIT TRAIL</span><h2>Recent admin activity</h2><p>Changes made through this control room.</p></div></div>
      {auditResult.data?.length ? <div className="admin-activity-list">{auditResult.data.map(entry => {
        const actor = profileById.get(entry.actor_id);
        const description = entry.action === "profile_updated" ? "Updated account access" : entry.action === "case_workflow_updated" ? "Changed case assignment or status" : entry.action.replaceAll("_", " ");
        return <article key={entry.id}><span className="admin-activity-dot"/><div><strong>{description}</strong><p>{entry.target_type === "profile" ? "Account" : "Case"} {shortId(entry.target_id)} · by {actor?.display_name || "Administrator"}</p></div><time>{new Date(entry.created_at).toLocaleString()}</time></article>;
      })}</div> : <p className="admin-empty">Admin actions will appear here as the project is managed.</p>}
    </section>

    <p className="admin-privacy-note">Admin access is limited to project oversight. Private doctor notes remain visible only to the assigned doctor. Use synthetic or de-identified records for this academic demonstration.</p>
  </main>;
}
