"""The saved artifacts load and match what the app and metadata say about them."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

MODELS = Path(__file__).resolve().parent.parent / "models"


def test_artifacts_exist():
    for name in ("rebuilt_baseline_cnn.keras", "amr_logistic_pipeline.joblib", "model_metadata.json"):
        assert (MODELS / name).is_file(), name


def test_cnn_shape_and_softmax(flask_app):
    m = flask_app.cnn_model
    assert m.input_shape == (None, 28, 28, 3)
    assert m.output_shape == (None, 7)
    assert m.count_params() == 157_735
    out = m.predict(np.random.default_rng(0).random((4, 28, 28, 3), dtype=np.float32), verbose=0)
    assert np.allclose(out.sum(axis=1), 1.0, atol=1e-5)


def test_class_maps_complete(flask_app):
    assert sorted(flask_app.CLASS_NAMES) == list(range(7))
    assert flask_app.CLASS_NAMES.keys() == flask_app.CLASS_DESCRIPTIONS.keys()


def test_amr_pipeline_matches_metadata(flask_app):
    pipe, meta = flask_app.amr_pipeline, flask_app.amr_metadata
    assert list(pipe.feature_names_in_) == meta["features"]
    assert list(pipe.classes_) == [0, 1]
    assert sum(meta["class_counts"].values()) == meta["training_records"]


def test_amr_categories_known_to_encoder(flask_app):
    """Every option the API accepts must be a category the one-hot encoder saw in training,
    otherwise handle_unknown='ignore' silently turns it into all zeros."""
    pre = flask_app.amr_pipeline.named_steps[list(flask_app.amr_pipeline.named_steps)[0]]
    cat = [t for t in pre.transformers_ if t[0] != "remainder" and "Sex" in list(t[2])][0]
    encoder = cat[1].named_steps[list(cat[1].named_steps)[-1]] if hasattr(cat[1], "named_steps") else cat[1]
    learned = {col: set(map(str, cats)) for col, cats in zip(cat[2], encoder.categories_)}
    allowed = {"Sex": {"F", "M"}, "Age Group": {"13-18", "19-35", "36-59", "≤12", "≥60"}, "On Abx": {"No", "Yes"}}
    for col, values in allowed.items():
        assert values <= learned[col], f"{col}: API allows {values - learned[col]} not seen in training"


def test_amr_probabilities_valid_for_all_inputs(flask_app):
    rows = [{"Year Case": y, "Sex": s, "Age Group": a, "On Abx": b}
            for y in (2015, 2020, 2024) for s in ("F", "M")
            for a in ("13-18", "19-35", "36-59", "≤12", "≥60") for b in ("No", "Yes")]
    p = flask_app.amr_pipeline.predict_proba(pd.DataFrame(rows))
    assert np.allclose(p.sum(axis=1), 1) and ((p >= 0) & (p <= 1)).all()
