# SkinLab demonstration runbook

Use this sequence for a repeatable project demonstration. Use only the configured demo accounts and synthetic or de-identified images and notes.

## Before the demonstration

1. Start the application with `Start-SkinLab.bat` and wait for the browser to open.
2. Confirm the site opens and that both Flask models report ready at `http://127.0.0.1:5000/api/health`.
3. Confirm the Supabase project is active and that the patient, doctor, and administrator demo accounts exist. Keep passwords out of this file, screenshots, and presentation materials.
4. Have a dermatoscopic sample image ready. Avoid photographs containing names, labels, or other identifying details.

## Patient workflow

1. Sign in to a patient account and review the workspace conversation list.
2. Use the case search and filters to show how cases can be found by person, case notes, latest message, type, and status; change the ordering to oldest first.
3. Open **Skin image**, upload the sample image, and show the preliminary class and model scores. Explain that the model returns one of seven DermaMNIST categories and does not diagnose a condition or assess infection.
4. Open **Antibiotic resistance**, enter a synthetic case year, exact age, sex, and antibiotic status, and show the MDR or No MDR dataset label. Explain that this is a research model output, not a patient's resistance result or treatment recommendation.
5. Open the created case, point out the assigned reviewer, plain-language preliminary result, conversation, and the option to message the reviewer.

## Doctor workflow

1. Sign in with an assigned doctor account. The doctor workspace lists only cases assigned to that account.
2. Open a case and review its image or structured inputs and model output.
3. Add an optional private note, then write and publish a patient-facing review in plain language. Avoid unsupported diagnosis, staging, prognosis, or treatment claims.
4. Send a message to the patient and show that the patient-facing review and message appear in the case conversation. Private notes remain separate from that conversation.

## Administrator workflow

1. Sign in as the administrator and open the case queue.
2. Demonstrate case type/status filters and assignment/status controls. Saving changes adds an entry to the audit trail.
3. Search for an account by display name or email, open its details, and demonstrate the role/active confirmation without changing a live demo account unless required.
4. Explain that administrator accounts and password resets are managed in Supabase Authentication; the app does not expose credentials.

## Checks before presenting

From the repository root, run:

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
.venv\Scripts\python.exe src\verify_models.py
```

From `frontend`, run `pnpm exec tsc --noEmit`. These checks verify API behavior, model loading/serving consistency, and frontend types. They do not establish clinical performance.
