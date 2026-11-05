import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

function PatientResult({ kind, output }: { kind: string; output: unknown }) {
  const result = output && typeof output === "object" ? output as Record<string, unknown> : {};
  if (kind === "lesion") {
    const label = typeof result.description === "string" ? result.description : "a skin lesion category";
    return <><h3>What the image analysis found</h3><p>The AI placed the image in a group called <strong>{label}</strong>. It cannot confirm what the condition is from a photo. Your doctor will review the image and this result.</p></>;
  }
  const label = result.predicted_class === "MDR" ? "MDR" : "No MDR";
  return <><h3>What the antibiotic resistance model found</h3><p>The AI selected the <strong>{label}</strong> group from a small research dataset. This result cannot tell whether you have an infection or whether any antibiotic will work. Your doctor will review the information you entered.</p></>;
}

export default async function CasePage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { caseId } = await params;
  const { notice } = await searchParams;
  const casePath = `/dashboard/cases/${caseId}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", user.id).maybeSingle();
  if (!profile) notFound();
  const { data: caseRow } = await supabase.from("cases").select("id,patient_id,assigned_doctor_id,kind,status,patient_summary,created_at").eq("id", caseId).maybeSingle();
  if (!caseRow) notFound();
  const { data: assignedDoctor } = caseRow.assigned_doctor_id
    ? await supabase.from("profiles").select("display_name").eq("id", caseRow.assigned_doctor_id).maybeSingle()
    : { data: null };
  const doctorName = assignedDoctor?.display_name?.trim() || "the assigned doctor";
  const { data: patientProfile } = await supabase.from("profiles").select("display_name").eq("id", caseRow.patient_id).maybeSingle();
  const patientName = patientProfile?.display_name?.trim() || "Patient";
  const [{ data: predictions }, { data: messages }, { data: reviews }, { data: assets }] = await Promise.all([
    supabase.from("prediction_runs").select("model_name,model_version,inputs,output,preliminary_summary,created_at").eq("case_id", caseId).order("created_at", {ascending:false}),
    supabase.from("case_messages").select("id,sender_id,body,created_at").eq("case_id", caseId).order("created_at"),
    supabase.from("doctor_reviews").select("doctor_id,patient_assessment,follow_up_instructions,published_at,created_at").eq("case_id", caseId).order("created_at", {ascending:false}),
    supabase.from("case_assets").select("storage_path,media_type").eq("case_id", caseId),
  ]);
  const imageUrls = await Promise.all((assets ?? []).map(async asset => {
    const { data } = await supabase.storage.from("case-images").createSignedUrl(asset.storage_path, 300);
    return data?.signedUrl;
  }));
  const doctor = profile.role === "doctor" && caseRow.assigned_doctor_id === user.id;
  const { data: internalNotes } = doctor
    ? await supabase.from("doctor_internal_notes").select("note,created_at").eq("case_id", caseId).order("created_at", {ascending:false})
    : { data: [] };
  const publishedReviews = (reviews ?? []).filter(review => review.published_at);
  const hasPublishedReview = publishedReviews.some(review => review.doctor_id === user.id);

  async function sendMessage(formData: FormData) {
    "use server";
    const db = await createClient();
    const { data: { user: actor } } = await db.auth.getUser();
    if (!actor) redirect("/login");
    const body = String(formData.get("body") ?? "").trim();
    if (!body || body.length > 10000) redirect(`${casePath}?notice=invalid-message`);
    const { error } = await db.from("case_messages").insert({ case_id: caseId, sender_id: actor.id, body });
    if (error) redirect(`${casePath}?notice=message-failed`);
    revalidatePath(casePath);
    redirect(`${casePath}?notice=message-sent`);
  }

  async function publishReview(formData: FormData) {
    "use server";
    const db = await createClient();
    const { data: { user: actor } } = await db.auth.getUser();
    if (!actor) redirect("/login");
    const { data: assigned } = await db.from("cases").select("id").eq("id", caseId).eq("assigned_doctor_id", actor.id).maybeSingle();
    if (!assigned) redirect(`${casePath}?notice=review-failed`);
    const assessment = String(formData.get("assessment") ?? "").trim();
    const followUp = String(formData.get("follow_up") ?? "").trim();
    if (!assessment || assessment.length > 10000 || followUp.length > 10000) redirect(`${casePath}?notice=invalid-review`);
    const { error } = await db.from("doctor_reviews").insert({ case_id: caseId, doctor_id: actor.id, patient_assessment: assessment, follow_up_instructions: followUp, published_at: new Date().toISOString() });
    if (error) redirect(`${casePath}?notice=review-failed`);
    const { error: statusError } = await db.from("cases").update({ status: "reviewed" }).eq("id", caseId).eq("assigned_doctor_id", actor.id);
    if (statusError) redirect(`${casePath}?notice=status-failed`);
    revalidatePath(casePath); revalidatePath("/dashboard");
    redirect(`${casePath}?notice=review-published`);
  }

  async function saveInternalNote(formData: FormData) {
    "use server";
    const db = await createClient();
    const { data: { user: actor } } = await db.auth.getUser();
    if (!actor) redirect("/login");
    const { data: assigned } = await db.from("cases").select("id").eq("id", caseId).eq("assigned_doctor_id", actor.id).maybeSingle();
    if (!assigned) redirect(`${casePath}?notice=note-failed`);
    const note = String(formData.get("note") ?? "").trim();
    if (!note || note.length > 10000) redirect(`${casePath}?notice=invalid-note`);
    const { error } = await db.from("doctor_internal_notes").insert({ case_id: caseId, doctor_id: actor.id, note });
    if (error) redirect(`${casePath}?notice=note-failed`);
    revalidatePath(casePath);
    redirect(`${casePath}?notice=note-saved`);
  }

  const notices: Record<string, string> = { "invalid-message": "Enter a message of up to 10,000 characters.", "message-failed": "Your message could not be sent. Please try again.", "message-sent": "Message sent.", "invalid-review": "Enter an assessment and keep each field under 10,000 characters.", "review-failed": "The review could not be published. Please try again.", "status-failed": "The review was saved, but the case status could not be updated. Please contact the administrator.", "review-published": "Doctor review published.", "invalid-note": "Enter a note of up to 10,000 characters.", "note-failed": "The private note could not be saved. Please try again.", "note-saved": "Private note saved." };
  return <main className="simple-view case-detail"><Link className="text-link" href="/dashboard">← My dashboard</Link><span className="pill">{caseRow.status.replaceAll("_", " ").toUpperCase()}</span><h1>{caseRow.kind === "lesion" ? "Skin image case" : "Antibiotic resistance case"}</h1><p>Submitted {new Date(caseRow.created_at).toLocaleString()}</p><p>{caseRow.assigned_doctor_id ? <>Assigned to <strong>{doctorName}</strong> for review.</> : "A doctor has not been assigned yet."}</p>{notice && notices[notice] && <p role="status" className="auth-message">{notices[notice]}</p>}
    <section className="glass case-panel"><h2>{doctor ? "Patient context" : "What you shared"}</h2><p>{caseRow.patient_summary || "No additional notes provided."}</p>{imageUrls.filter(Boolean).map((url,i)=><img className="case-image" src={url} alt={`Submitted case image ${i+1}`} key={url}/>)}</section>
    <section className="glass case-panel"><h2>{doctor ? "AI model details" : "Preliminary AI result"}</h2>{predictions?.length ? predictions.map((run,i)=><article className="case-prediction" key={`${run.model_version}-${i}`}>{doctor ? <><small>{run.model_name} · {run.model_version}</small><pre>{JSON.stringify(run.output,null,2)}</pre><details className="case-inputs"><summary>Inputs recorded and sent to model</summary><pre>{JSON.stringify(run.inputs,null,2)}</pre></details><p>{run.preliminary_summary}</p></> : <PatientResult kind={caseRow.kind} output={run.output}/>}</article>) : <p>The AI result is unavailable. {doctorName} can still review the submitted case.</p>}{!doctor && <p className="note">Generated by AI. This is an early research result, not a diagnosis or treatment advice.</p>}</section>
    {doctor && !hasPublishedReview && <section className="glass case-panel"><h2>Write your review</h2><p>Explain what you reviewed, what the result does and does not mean for this case, and any clear next step. The patient will see your words exactly as written.</p><form action={publishReview} className="case-form"><label>Assessment for patient<textarea name="assessment" required maxLength={10000} placeholder="Explain your review in plain language for this patient"/></label><label>Follow-up instructions<textarea name="follow_up" maxLength={10000} placeholder="Give a specific next step, if appropriate"/></label><button className="action mint">Share review with patient</button></form></section>}
    {doctor && hasPublishedReview && <section className="glass case-panel"><h2>Review shared</h2><p>Your review is published and visible in the patient conversation below.</p></section>}
    {(!doctor || publishedReviews.length > 0) && <section className="glass case-panel"><h2>{doctor ? "Review shared with patient" : `Review from ${doctorName}`}</h2>{publishedReviews.length ? publishedReviews.map((review,i)=><article key={i}><p>{review.patient_assessment}</p>{review.follow_up_instructions&&<p><strong>Next step:</strong> {review.follow_up_instructions}</p>}<small>{doctorName} · {new Date(review.published_at!).toLocaleString()}</small></article>) : <p>{doctorName} has not shared a review yet.</p>}</section>}
    <section className="glass case-panel"><h2>{doctor ? `Conversation with ${patientName}` : `Conversation with ${doctorName}`}</h2><div className="message-list"><article><small>Case update · {new Date(caseRow.created_at).toLocaleString()}</small><p>{caseRow.assigned_doctor_id ? <>Your case {predictions?.length ? "and AI result were" : "was"} shared with {doctorName} for review.</> : "Your case is saved. A doctor has not been assigned yet."}</p></article>{(messages ?? []).map(message=><article key={message.id}><small>{message.sender_id===user.id?"You":message.sender_id===caseRow.assigned_doctor_id?doctorName:patientName} · {new Date(message.created_at).toLocaleString()}</small><p>{message.body}</p></article>)}</div><form action={sendMessage} className="case-form"><label>Message to {doctor ? patientName : doctorName}<textarea name="body" required maxLength={10000}/></label><button className="action outline">Send message</button></form></section>
    {doctor && <section className="glass case-panel"><h2>Private doctor notes</h2><p>Visible only to the assigned doctor account. These notes are separate from the patient conversation.</p>{internalNotes?.length ? <div className="message-list">{internalNotes.map((entry,i)=><article key={i}><small>{new Date(entry.created_at).toLocaleString()}</small><p>{entry.note}</p></article>)}</div> : <p>No private notes yet.</p>}<form action={saveInternalNote} className="case-form"><label>Internal note<textarea name="note" required maxLength={10000}/></label><button className="action outline">Save private note</button></form></section>}
  </main>;
}
