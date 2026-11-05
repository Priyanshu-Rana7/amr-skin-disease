import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { MDR_MODEL_YEAR } from "@/lib/model-config";

export const runtime = "nodejs";

function requiredInteger(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return Number.NaN;
  return Number(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to submit a case." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || profile.role !== "patient") return NextResponse.json({ error: "Only active patient accounts can submit cases." }, { status: 403 });

  const form = await request.formData();
  const currentYear = new Date().getFullYear();
  const kind = String(form.get("kind") ?? "");
  if (kind !== "lesion" && kind !== "mdr") return NextResponse.json({ error: "Choose a valid research flow." }, { status: 400 });
  if (kind === "lesion") {
    const image = form.get("image");
    if (!(image instanceof File) || !image.size || image.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image smaller than 8 MB." }, { status: 400 });
  } else {
    const age = requiredInteger(form.get("age")); const year = requiredInteger(form.get("year"));
    if (!Number.isInteger(age) || age < 0 || age > 120 || !["F", "M"].includes(String(form.get("sex"))) || !["Yes", "No"].includes(String(form.get("abx"))) || !Number.isInteger(year) || year < 1900 || year > currentYear) return NextResponse.json({ error: `Enter a valid age, sex, antibiotic value, and case year (1900–${currentYear}).` }, { status: 400 });
  }
  const summary = String(form.get("summary") ?? "").slice(0, 4000);
  const { data: caseRow, error: caseError } = await supabase.from("cases").insert({ patient_id: user.id, kind, patient_summary: summary }).select("id,assigned_doctor_id,status").single();
  if (caseError || !caseRow) return NextResponse.json({ error: caseError?.message ?? "Could not create case." }, { status: 400 });
  const { data: assignedDoctor } = caseRow.assigned_doctor_id
    ? await supabase.from("profiles").select("display_name").eq("id", caseRow.assigned_doctor_id).maybeSingle()
    : { data: null };
  const doctorName = assignedDoctor?.display_name?.trim() || null;

  const flask = (process.env.FLASK_API_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");
  let input: Record<string, unknown> = {};
  let predictionResponse: Response;

  if (kind === "lesion") {
    const image = form.get("image");
    if (!(image instanceof File) || !image.size || image.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Upload an image smaller than 8 MB." }, { status: 400 });
    const imageForm = new FormData(); imageForm.set("image", image, image.name);
    input = { filename: image.name, content_type: image.type };
    const storagePath = `${caseRow.id}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("case-images").upload(storagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: `Case created, but image storage failed: ${uploadError.message}`, case_id: caseRow.id }, { status: 502 });
    const { error: assetError } = await supabase.from("case_assets").insert({ case_id: caseRow.id, storage_path: storagePath, media_type: image.type });
    if (assetError) return NextResponse.json({ error: `Image stored, but case record failed: ${assetError.message}`, case_id: caseRow.id }, { status: 502 });
    try {
      predictionResponse = await fetch(`${flask}/api/predict/skin`, { method: "POST", body: imageForm, cache: "no-store", signal: AbortSignal.timeout(55000) });
    } catch {
      return NextResponse.json({ error: "Your case and image were saved for doctor review, but the model is unavailable. Open the case in your workspace.", case_id: caseRow.id }, { status: 502 });
    }
  } else {
    const age = requiredInteger(form.get("age"));
    const sex = String(form.get("sex") ?? "");
    const abx = String(form.get("abx") ?? "");
    const year = requiredInteger(form.get("year"));
    if (!Number.isInteger(age) || age < 0 || age > 120 || !["F", "M"].includes(sex) || !["Yes", "No"].includes(abx) || !Number.isInteger(year) || year < 1900 || year > currentYear) return NextResponse.json({ error: `Enter a valid age, supported sex and antibiotic value, and case year (1900–${currentYear}).` }, { status: 400 });
    const ageGroup = age <= 12 ? "≤12" : age <= 18 ? "13-18" : age <= 35 ? "19-35" : age <= 59 ? "36-59" : "≥60";
    input = { "Reported Case Year": year, "Year Case": MDR_MODEL_YEAR, Sex: sex, "Age (years)": age, "Age Group": ageGroup, "On Abx": abx };
    try {
      predictionResponse = await fetch(`${flask}/api/predict/amr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "Year Case": MDR_MODEL_YEAR, Sex: sex, "Age Group": ageGroup, "On Abx": abx }), cache: "no-store", signal: AbortSignal.timeout(55000) });
    } catch {
      return NextResponse.json({ error: "Your case was saved for doctor review, but the model is unavailable. Open the case in your workspace.", case_id: caseRow.id }, { status: 502 });
    }
  }

  const prediction = await predictionResponse.json().catch(() => null);
  if (!predictionResponse.ok || !prediction) return NextResponse.json({ error: prediction?.error ?? "Prediction service is unavailable.", case_id: caseRow.id }, { status: 502 });
  const model = kind === "lesion" ? { name: "DermaMNIST CNN", version: "rebuilt_baseline_cnn" } : { name: "MDR Logistic Regression", version: "amr_logistic_pipeline" };
  const preliminary = kind === "lesion"
    ? `The research model assigned the label ${prediction.predicted_class}. This is not a diagnosis and does not assess wound infection or drug resistance. A doctor must review the case.`
    : `The research model assigned the historical dataset label ${prediction.predicted_class} using the fixed ${MDR_MODEL_YEAR} training-year input. The entered case year (${String(form.get("year"))}) is recorded separately and was not used by the model. This does not establish the resistance status of an infection or recommend treatment. A doctor must review the case.`;
  const { error: runError } = await supabase.from("prediction_runs").insert({ case_id: caseRow.id, model_name: model.name, model_version: model.version, inputs: input, output: prediction, preliminary_summary: preliminary });
  if (runError) return NextResponse.json({ error: `Prediction completed, but saving it failed: ${runError.message}`, case_id: caseRow.id }, { status: 502 });
  return NextResponse.json({ case_id: caseRow.id, assigned: Boolean(caseRow.assigned_doctor_id), doctor_name: doctorName, status: caseRow.status, prediction, preliminary_summary: preliminary });
}
