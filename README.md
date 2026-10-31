# Skin and AMR Research Studio

## Start the project on Windows

Double-click `Start-SkinLab.bat`. It starts Flask and Next.js in minimized terminal windows, waits for the website, selects an available port from 3000–3010, and opens the site in your browser. Keep both terminal windows open while using the project. Close them to stop the servers.

Frontend edits appear automatically through Next.js development mode. Flask restarts when backend Python files change. Changes to Python or Node dependencies require reinstalling those dependencies.

To run manually, open two PowerShell windows:

1. From the project root, run `.venv\\Scripts\\python.exe src\\app.py`.
2. From `frontend`, run `pnpm exec next dev` and open `http://localhost:3000`.

The Next.js app proxies `/api/*` requests to Flask on port 5000. The models are exploratory research artifacts; results are not suitable for diagnosis or treatment decisions.
