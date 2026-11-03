"""Shared fixtures. The Flask app loads both models at import, so it is imported once per session."""
import io
import os
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR / "src"))

# DermaMNIST (28x28) from https://zenodo.org/records/10519652 . Not in git; quality tests skip without it.
DERMAMNIST = Path(os.getenv("DERMAMNIST_NPZ", Path.home() / ".cache/amr-skin-disease/dermamnist.npz"))


@pytest.fixture(scope="session")
def flask_app():
    import app as app_module
    app_module.app.config.update(TESTING=True)
    return app_module


@pytest.fixture()
def client(flask_app):
    return flask_app.app.test_client()


def image_bytes(fmt="PNG", size=(64, 64), mode="RGB", color=(180, 120, 110)):
    buf = io.BytesIO()
    Image.new(mode, size, color if mode != "L" else 128).save(buf, format=fmt)
    return buf.getvalue()


def array_to_png(arr):
    buf = io.BytesIO()
    Image.fromarray(np.asarray(arr, dtype=np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def dermamnist():
    if not DERMAMNIST.is_file():
        pytest.skip(f"DermaMNIST not found at {DERMAMNIST} (set DERMAMNIST_NPZ)")
    data = np.load(DERMAMNIST)
    return data["test_images"], data["test_labels"].ravel()


VALID_CASE = {"Year Case": 2024, "Sex": "F", "Age Group": "19-35", "On Abx": "Yes"}
SKIN_CLASSES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
