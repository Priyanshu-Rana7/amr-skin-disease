# Skin and AMR Research Studio

## Start the project on Windows

Double-click `Start-SkinLab.bat`. It starts Flask and Next.js in minimized terminal windows, waits for the website, selects an available port from 3000–3010, and opens the site in your browser. Keep both terminal windows open while using the project. Close them to stop the servers.

Frontend edits appear automatically through Next.js development mode. Flask restarts when backend Python files change. Changes to Python or Node dependencies require reinstalling those dependencies.

To run manually, open two PowerShell windows:

1. From the project root, run `.venv\\Scripts\\python.exe src\\app.py`.
2. From `frontend`, run `pnpm exec next dev` and open `http://localhost:3000`.

The Next.js app proxies `/api/*` requests to Flask on port 5000. The models are exploratory research artifacts; results are not suitable for diagnosis or treatment decisions.

## Start the project on Linux (Ubuntu)

Needs Python 3.11, Node 22+ and [uv](https://docs.astral.sh/uv/).

```bash
uv venv --python 3.11 .venv
uv pip install --python .venv -r requirements-dev.txt
cd frontend && npx pnpm@10 install --frozen-lockfile && cd ..
```

Run the two servers by hand:

```bash
FLASK_PORT=5000 .venv/bin/python src/app.py            # API
cd frontend && FLASK_API_URL=http://127.0.0.1:5000 npx pnpm@10 exec next dev   # website on :3000
```

Or keep them running with PM2 (`ecosystem.config.js`, ports from `AMR_API_PORT` / `AMR_WEB_PORT`, default 7312 / 7313):

```bash
pm2 start ecosystem.config.js && pm2 save
```

`src/app.py` reads `FLASK_HOST` (default `127.0.0.1`), `FLASK_PORT` (default `5000`) and `FLASK_DEBUG`.

## Python dependencies

`requirements.txt` pins the versions the saved models need: the CNN only loads with Keras 3 (TensorFlow 2.18) and the AMR pipeline was saved with scikit-learn 1.6.1. On Windows: `.venv\Scripts\python.exe -m pip install -r requirements-dev.txt`.

## Tests

| Suite | Command | Covers |
|---|---|---|
| Backend | `.venv/bin/python -m pytest` | API routes, upload and input validation, error format, CORS, model artifacts, AMR metadata |
| Model quality | included in pytest | Sends real DermaMNIST test images through `POST /api/predict/skin` and checks the reported metrics. Needs `dermamnist.npz` from [Zenodo](https://zenodo.org/records/10519652) at `~/.cache/amr-skin-disease/dermamnist.npz` (or set `DERMAMNIST_NPZ`); skipped without it |
| Frontend types | `cd frontend && npx pnpm@10 typecheck` | TypeScript |
| Frontend build | `cd frontend && npx pnpm@10 build` | Production build |
| End to end | `cd frontend && E2E_BASE_URL=http://127.0.0.1:3000 npx pnpm@10 test:e2e` | Every page (desktop + mobile), navigation, AMR and skin flows, error messages. Needs both servers running and Google Chrome |
