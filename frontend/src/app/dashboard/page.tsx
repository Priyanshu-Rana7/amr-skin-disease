import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

const STATUSES = ["submitted", "awaiting_review", "in_review", "awaiting_patient", "reviewed", "closed"];
const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  awaiting_patient: "Awaiting patient",
  reviewed: "Reviewed",
  closed: "Closed",
};

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ q?: string; kind?: string; status?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLocaleLowerCase();
  const kindFilter = params.kind === "lesion" || params.kind === "mdr" ? params.kind : "";
  const statusFilter = STATUSES.includes(params.status ?? "") ? params.status ?? "" : "";
  const sort = params.sort === "oldest" ? "oldest" : "recent";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", user.id).maybeSingle();
  if (!profile) return <main className="simple-view"><h1>Account setup pending</h1><p>Your profile could not be loaded. Ask the project administrator to check the Supabase profile trigger and access policies.</p></main>;
  if (profile.role === "admin") redirect("/dashboard/admin");

  const { data: cases, error: casesError } = await supabase
    .from("cases")
    .select("id,patient_id,kind,status,patient_summary,created_at,assigned_doctor_id")
    .order("created_at", { ascending: sort === "oldest" })
    .limit(100);
  const caseIds = (cases ?? []).map(item => item.id);
  const { data: messages, error: messagesError } = caseIds.length
    ? await supabase.from("case_messages").select("case_id,sender_id,body,created_at").in("case_id", caseIds).order("created_at", { ascending: false }).limit(200)
    : { data: [], error: null };

  const latestMessages = new Map<string, NonNullable<typeof messages>[number]>();
  for (const message of messages ?? []) {
    if (!latestMessages.has(message.case_id)) latestMessages.set(message.case_id, message);
  }

  const doctor = profile.role === "doctor";
  const counterpartIds = [...new Set((cases ?? [])
    .map(item => doctor ? item.patient_id : item.assigned_doctor_id)
    .filter(Boolean))] as string[];
  const { data: counterpartProfiles } = counterpartIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", counterpartIds)
    : { data: [] };
  const counterpartNames = new Map((counterpartProfiles ?? []).map(person => [person.id, person.display_name || (doctor ? "Patient" : "Doctor")]));

  const visibleCases = (cases ?? []).filter(item => {
    if (kindFilter && item.kind !== kindFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (!query) return true;
    const contactId = doctor ? item.patient_id : item.assigned_doctor_id;
    const contact = contactId ? counterpartNames.get(contactId) : "";
    const latest = latestMessages.get(item.id);
    return [
      item.id,
      item.patient_summary,
      item.kind === "lesion" ? "skin image lesion" : "antibiotic resistance mdr",
      item.status.replaceAll("_", " "),
      contact,
      latest?.body,
    ].some(value => String(value ?? "").toLocaleLowerCase().includes(query));
  });

  return <main className="simple-view">
    <span className="pill">{doctor ? "DOCTOR WORKSPACE" : "PATIENT WORKSPACE"}</span>
    <h1>{doctor ? `Welcome, ${profile.display_name || "Doctor"}` : "Your conversations"}</h1>
    <p>{doctor ? "Review your assigned cases and continue conversations with patients." : "Your cases, doctor reviews, and messages are gathered here."}</p>
    {(casesError || messagesError) && <p role="alert" className="auth-message">Some case information could not be loaded. Refresh the page, and contact the project administrator if the problem continues.</p>}
    {!doctor && <div className="dashboard-actions"><Link className="action mint" href="/skin">Start skin image case</Link><Link className="action outline" href="/amr">Start antibiotic resistance case</Link></div>}

    <section aria-label="Case list">
      <form className="workspace-case-filters" action="/dashboard" method="get">
        <label>Search cases<input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Case, notes, person, or latest message"/></label>
        <label>Case type<select name="kind" defaultValue={kindFilter}><option value="">All case types</option><option value="lesion">Skin image</option><option value="mdr">Antibiotic resistance</option></select></label>
        <label>Status<select name="status" defaultValue={statusFilter}><option value="">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        <label>Order<select name="sort" defaultValue={sort}><option value="recent">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <button className="action outline" type="submit">Filter cases</button>
        <Link className="text-link" href="/dashboard">Clear</Link>
      </form>

      {!casesError && cases?.length === 100 && <p className="admin-footnote">Showing the 100 most recent cases available to this account. Use the filters to narrow the list.</p>}
      {!casesError && cases?.length ? <section className="case-list" aria-label={`${visibleCases.length} matching cases`}>
        {visibleCases.length ? visibleCases.map(item => {
          const latest = latestMessages.get(item.id);
          const contactId = doctor ? item.patient_id : item.assigned_doctor_id;
          const contact = contactId ? counterpartNames.get(contactId) : null;
          return <article className="glass case-row conversation-row" key={item.id}>
            <div>
              <strong>{item.kind === "lesion" ? "Skin image case" : "Antibiotic resistance case"}</strong>
              <p>{doctor ? `Patient: ${contact || "Patient"}` : contact ? `Doctor: ${contact}` : "Waiting for a doctor to be assigned"}</p>
              <p>{latest ? `${latest.sender_id === user.id ? "You" : contact || "Case participant"}: ${latest.body}` : item.patient_summary || "Case submitted; no messages yet."}</p>
            </div>
            <span>{STATUS_LABELS[item.status] ?? item.status.replaceAll("_", " ")}</span>
            <Link className="text-link" href={`/dashboard/cases/${item.id}`}>{doctor ? "Review case →" : "Open conversation →"}</Link>
          </article>;
        }) : <div className="glass case-empty">No cases match these filters.</div>}
      </section> : !casesError && <div className="glass case-empty">{doctor ? "No cases are assigned to you yet." : "No conversations yet. Start a case to contact a doctor."}</div>}
    </section>
  </main>;
}
