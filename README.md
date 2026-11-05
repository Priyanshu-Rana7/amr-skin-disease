# Skin and AMR Research Studio

SkinLab presents two independent educational experiments. Lesion Research accepts dermatoscopic research images and returns one of seven DermaMNIST labels. MDR Research accepts historical structured case fields and predicts the dataset's recorded MDR label. There is no image-to-AMR pipeline, patient triage, or treatment recommendation. The home and workflow pages explain each tool's inputs, outputs, and evaluation limits.

The MDR form accepts exact age and maps it to the age bands used by the saved model. It records the year entered as case context and sends a fixed 2021 year to the model. The reported five-fold metrics evaluate the original training procedure with recorded years; they do not evaluate this fixed-year demo behavior. A five-fold comparison on the 171 labeled records gave mixed results with and without year, so the saved pipeline was not retrained or replaced: with year, accuracy was 62.57%, macro F1 0.6236, and ROC-AUC 0.6216; without year, accuracy was 61.40%, macro F1 0.6110, and ROC-AUC 0.6312. The comparison is reproducible with `src/compare_amr_year.py` when the supplied workbook is available. This small retrospective dataset cannot support current patient-specific resistance estimates.

## Patient and doctor case workflow

Sign in or create a patient account to submit a research case. Submissions are assigned to the active doctor with the fewest open cases, and the patient sees the result as preliminary while they can message the reviewer. Assigned doctors can message the patient, add private notes, and publish a patient-facing review. Supabase stores the case, model output, messages, review, and private image reference under row-level security. Apply the initial schema and subsequent migrations in [`supabase/README.md`](supabase/README.md) before using submissions. Use only synthetic or de-identified demonstration records.

If model inference fails after a case is created, the submission remains in the workspace for doctor review. The form shows a link to that case. A lesion image is stored before inference so the assigned doctor can still inspect it. A missing model result is shown as pending or unavailable on the case page; it is never presented as a successful prediction.

For a complete demonstration, sign in as a patient, submit each case type, open its case page, sign in as the assigned doctor, review the case and publish an assessment, then sign back in as the patient to read the review and send a message. Doctor accounts must be assigned through Supabase administration; ordinary sign-up creates patient accounts.

Supabase Auth requires at least six password characters, matching the sign-up form. Supabase's leaked-password protection is available only on Pro plans; the current Free project cannot enable it.

## Start the project on Windows

Double-click `Start-SkinLab.bat`. It starts Flask and Next.js in the background, waits for the website, selects an available port from 3000–3010, and opens the site in your browser. The servers keep running after the launcher closes; stop them from Task Manager when finished.

Frontend edits appear automatically through Next.js development mode. Flask restarts when backend Python files change. Changes to Python or Node dependencies require reinstalling those dependencies.

To run manually, open two PowerShell windows:

1. From the project root, run `.venv\\Scripts\\python.exe src\\app.py`.
2. From `frontend`, run `pnpm exec next dev` and open `http://localhost:3000`.

The authenticated Next.js case route calls Flask on port 5000 from the server, then saves each output to the assigned case in Supabase. Raw Flask prediction endpoints are not exposed through the Next.js app. The models are exploratory research artifacts; results are not suitable for diagnosis or treatment decisions.

## Active model sources

The deployed CNN is `models/rebuilt_baseline_cnn.keras`, selected in `SkinDisease_AMR_Integrated_Project.ipynb`. Its input is a 28 × 28 RGB image scaled to 0–1. The deployed AMR pipeline is `models/amr_logistic_pipeline.joblib`, trained in `AMR Prediction.ipynb` on 171 labeled cases from 2019–2021. `models/model_metadata.json` records its features, class counts, and threshold. These notebooks and source datasets were supplied separately from this repository; preserve their versions alongside any future model update.

Run `.venv\Scripts\python.exe src\verify_models.py` to compare the skin API's class scores with direct inference on the same image. The reported evaluation figures on the Research page come from the active notebooks; this check validates serving consistency, not model accuracy.
