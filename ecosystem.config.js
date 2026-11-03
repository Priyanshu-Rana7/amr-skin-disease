// PM2 apps for running SkinLab on Linux (used on Talha's Ubuntu machine).
// Windows users can keep using Start-SkinLab.bat instead.
// Ports come from env so each machine can pick its own; defaults match README.
const path = require("path");

const API_PORT = process.env.AMR_API_PORT || "7312";
const WEB_PORT = process.env.AMR_WEB_PORT || "7313";
const root = __dirname;

module.exports = {
  apps: [
    {
      name: "amr-skin-api",
      cwd: root,
      script: path.join(root, ".venv/bin/python"),
      args: ["src/app.py"],
      interpreter: "none",
      env: {
        FLASK_HOST: "127.0.0.1",
        FLASK_PORT: API_PORT,
        FRONTEND_ORIGINS: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}`,
        TF_CPP_MIN_LOG_LEVEL: "2",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: path.join(root, "logs/api.out.log"),
      error_file: path.join(root, "logs/api.err.log"),
    },
    {
      name: "amr-skin-web",
      cwd: path.join(root, "frontend"),
      script: "node_modules/next/dist/bin/next",
      args: ["dev", "--hostname", "127.0.0.1", "--port", WEB_PORT],
      env: { FLASK_API_URL: `http://127.0.0.1:${API_PORT}` },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: path.join(root, "logs/web.out.log"),
      error_file: path.join(root, "logs/web.err.log"),
    },
  ],
};
