import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", user.id).maybeSingle();
  if (!profile) return <main className="simple-view"><h1>Account setup pending</h1><p>Your profile could not be loaded. Ask the project administrator to check the Supabase profile trigger and access policies.</p></main>;
  const { data: cases } = await supabase.from("cases").select("id,patient_id,kind,status,patient_summary,created_at,assigned_doctor_id").order("created_at",{ascending:false}).limit(50);
  const caseIds = (cases ?? []).map(item => item.id);
  const { data: messages } = caseIds.length
    ? await supabase.from("case_messages").select("case_id,sender_id,body,created_at").in("case_id", caseIds).order("created_at", { ascending: false }).limit(200)
    : { data: [] };
  const latestMessages = new Map<string, NonNullable<typeof messages>[number]>();
  for (const message of messages ?? []) {
    if (!latestMessages.has(message.case_id)) latestMessages.set(message.case_id, message);
  }
  const counterpartIds = [...new Set((cases ?? []).map(item => profile.role === "doctor" ? item.patient_id : item.assigned_doctor_id).filter(Boolean))] as string[];
  const { data: counterpartProfiles } = counterpartIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", counterpartIds)
    : { data: [] };
  const counterpartNames = new Map((counterpartProfiles ?? []).map(person => [person.id, person.display_name || (profile.role === "doctor" ? "Patient" : "Doctor")]));
  const doctor = profile.role === "doctor";
  return <main className="simple-view"><span className="pill">{doctor ? "DOCTOR WORKSPACE" : "PATIENT WORKSPACE"}</span><h1>{doctor ? `Welcome, ${profile.display_name || "Doctor"}` : "Your conversations"}</h1><p>{doctor ? "Review your assigned cases and continue conversations with patients." : "Your cases, doctor reviews, and messages are gathered here."}</p>
    {!doctor && <div className="dashboard-actions"><Link className="action mint" href="/skin">Start skin image case</Link><Link className="action outline" href="/amr">Start antibiotic resistance case</Link></div>}
    <section className="case-list">{cases?.length ? cases.map(item=>{const latest=latestMessages.get(item.id);const contactId=doctor?item.patient_id:item.assigned_doctor_id;const contact=contactId?counterpartNames.get(contactId):null;return <article className="glass case-row conversation-row" key={item.id}><div><strong>{item.kind === "lesion" ? "Skin image case" : "Antibiotic resistance case"}</strong><p>{doctor?`Patient: ${contact || "Patient"}`:contact?`Doctor: ${contact}`:"Waiting for a doctor to be assigned"}</p><p>{latest?`${latest.sender_id===user.id?"You":contact || "Case participant"}: ${latest.body}`:item.patient_summary || "Case submitted; no messages yet."}</p></div><span>{item.status.replaceAll("_"," ")}</span><Link className="text-link" href={`/dashboard/cases/${item.id}`}>{doctor?"Review case →":"Open conversation →"}</Link></article>}) : <div className="glass case-empty">{doctor ? "No cases are assigned to you yet." : "No conversations yet. Start a case to contact a doctor."}</div>}</section>
  </main>;
}
