"""End-to-end model quality: real DermaMNIST test images go through POST /api/predict/skin
exactly as a browser upload would (PNG -> Flask preprocessing -> CNN). The project reports
accuracy 0.7686 / balanced accuracy 0.5507 / macro F1 0.5661 on this test split."""
import io

import numpy as np
import pytest
from sklearn.metrics import accuracy_score, balanced_accuracy_score

from conftest import SKIN_CLASSES, array_to_png

N = 400  # stratified-ish sample of the 2,005 test images keeps the run short


@pytest.fixture(scope="module")
def api_predictions(flask_app, dermamnist):
    client = flask_app.app.test_client()
    images, labels = dermamnist
    idx = np.random.default_rng(42).permutation(len(labels))[:N]
    preds, top = [], []
    for i in idx:
        r = client.post("/api/predict/skin", data={"image": (io.BytesIO(array_to_png(images[i])), "x.png")},
                        content_type="multipart/form-data")
        body = r.get_json()
        preds.append(body["class_index"])
        top.append(max(body["class_scores"].values()))
    return labels[idx], np.array(preds), np.array(top)


def test_model_reproduces_reported_metrics_offline(flask_app, dermamnist):
    """The artifact itself is fine when fed 0-1 pixels: this pins down training preprocessing."""
    images, labels = dermamnist
    pred = flask_app.cnn_model.predict(images.astype("float32") / 255.0, verbose=0).argmax(1)
    assert round(accuracy_score(labels, pred), 4) == 0.7686
    assert round(balanced_accuracy_score(labels, pred), 4) == 0.5507


def test_api_predicts_more_than_one_class(api_predictions):
    _, pred, _ = api_predictions
    assert len(set(pred)) >= 4, f"API predicted only {[SKIN_CLASSES[c] for c in set(pred)]}"


def test_api_scores_are_not_saturated(api_predictions):
    _, _, top = api_predictions
    assert np.mean(top > 0.999) < 0.5, f"{np.mean(top > 0.999):.0%} of predictions have a ~100% score"


def test_api_balanced_accuracy_close_to_reported(api_predictions):
    labels, pred, _ = api_predictions
    assert balanced_accuracy_score(labels, pred) > 0.45
